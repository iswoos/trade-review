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
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() })),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
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
    const addLineSeriesSpy = vi.fn((_options?: { lineStyle?: number }) => ({ setData: vi.fn(), setMarkers: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addLineSeries: addLineSeriesSpy,
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);
    vi.mocked(quotes.fetchHistory).mockResolvedValue([{ date: '2026-01-01', close: 11.36 }]);

    function hasAvgCostLine() {
      return addLineSeriesSpy.mock.calls.some(([config]) => (config as { lineStyle?: number }).lineStyle === 2);
    }

    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');
    await waitFor(() => expect(hasAvgCostLine()).toBe(false)); // no position yet: no avg-cost line

    await userEvent.click(screen.getByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    await waitFor(() => expect(hasAvgCostLine()).toBe(true));
  });
});
