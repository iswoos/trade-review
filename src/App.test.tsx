import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createChart } from 'lightweight-charts';
import { App } from './App';
import * as quotes from './api/quotes';

vi.mock('./api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/quotes')>();
  return {
    ...actual,
    searchSymbols: vi.fn().mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]),
    fetchQuote: vi.fn().mockResolvedValue({ price: 11.36, currency: 'USD' }),
    fetchHistory: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
    timeScale: vi.fn(() => ({
      setVisibleLogicalRange: vi.fn(),
      getVisibleLogicalRange: vi.fn(),
      timeToCoordinate: vi.fn(() => null),
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
    })),
    remove: vi.fn(),
  })),
  CandlestickSeries: {},
  LineSeries: {},
  LineStyle: { Dashed: 2 },
}));

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe('App', () => {
  it('starts on the home screen and goes straight to the chart when a new ticker is selected (no trade form gating)', async () => {
    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument();
  });

  it('shows the avg-cost line only after the first trade is saved for a brand-new ticker', async () => {
    // ChartScreen loads history/trades/position from separate async sources, so PriceChart's
    // effect can re-run more than once while data trickles in. Assert on whether a dashed
    // (avg-cost) series was ever added, not on a raw call count, which would be flaky here.
    const addSeriesSpy = vi.fn((_seriesType?: unknown, _options?: { lineStyle?: number }) => ({
      setData: vi.fn(),
    }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
    vi.mocked(quotes.fetchHistory).mockResolvedValue([
      { date: '2026-01-01', open: 11.36, high: 11.36, low: 11.36, close: 11.36 },
    ]);

    function hasAvgCostLine() {
      return addSeriesSpy.mock.calls.some(
        ([, config]) => (config as { lineStyle?: number } | undefined)?.lineStyle === 2
      );
    }

    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');
    await waitFor(() => expect(hasAvgCostLine()).toBe(false)); // no position yet: no avg-cost line

    await userEvent.click(screen.getByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(await screen.findByRole('button', { name: '잘 모르겠음' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(hasAvgCostLine()).toBe(true));
  });

  it('excludes a fully-closed position (quantity sold back to zero) from being grouped as "내 포지션" in search', async () => {
    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    // buy 10 shares
    await userEvent.click(await screen.findByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(await screen.findByRole('button', { name: '잘 모르겠음' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument());

    // sell all 10 shares to close the position
    await userEvent.click(screen.getByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.click(screen.getByRole('button', { name: '매도' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(await screen.findByRole('button', { name: '잘 모르겠음' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument());

    // search again on the (still-mounted) chart screen's search bar - JOBY should no longer
    // be grouped as a held position, only as a fresh API search result.
    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await waitFor(() => {
      expect(screen.queryByRole('list', { name: '내 포지션 검색 결과' })).not.toBeInTheDocument();
    });
    expect(await screen.findByRole('list', { name: '신규 검색 결과' })).toBeInTheDocument();
  });

  it('pressing the browser back button returns from the chart screen to the home screen', async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    window.history.back();

    await waitFor(() => expect(screen.getByRole('list', { name: '보유 주식 목록' })).toBeInTheDocument());
    expect(screen.queryByTestId('price-chart')).not.toBeInTheDocument();
  });

  it('clicking the home button in the chart screen navigates back to the home screen', async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    await userEvent.click(screen.getByRole('button', { name: '홈' }));

    await waitFor(() => expect(screen.getByRole('list', { name: '보유 주식 목록' })).toBeInTheDocument());
  });

  it('switching tickers while already on the chart screen replaces history instead of stacking (one back returns to home)', async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    // still on the chart screen - select a result again (exercises the replaceState path)
    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    window.history.back();

    await waitFor(() => expect(screen.getByRole('list', { name: '보유 주식 목록' })).toBeInTheDocument());
  });

  it('navigates to the tag management screen and back via the home button', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '태그 관리' }));
    expect(await screen.findByRole('list', { name: '태그 목록' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '홈' }));
    await waitFor(() => expect(screen.getByRole('list', { name: '보유 주식 목록' })).toBeInTheDocument());
  });

  it('a tag created in tag management is available for selection in a newly opened trade form', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '태그 관리' }));
    await userEvent.type(await screen.findByLabelText('새 태그 이름'), '장기투자');
    await userEvent.click(screen.getByRole('button', { name: '태그 추가' }));
    await screen.findByText('장기투자');

    await userEvent.click(screen.getByRole('button', { name: '홈' }));
    await waitFor(() => expect(screen.getByRole('list', { name: '보유 주식 목록' })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await userEvent.click(await screen.findByRole('button', { name: '+ 매매 기록 추가' }));

    expect(await screen.findByRole('button', { name: '장기투자' })).toBeInTheDocument();
  });
});
