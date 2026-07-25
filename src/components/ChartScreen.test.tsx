import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTrade } from '../db/trades';
import { ChartScreen } from './ChartScreen';
import * as quotes from '../api/quotes';
import * as tradesModule from '../db/trades';
import type { PositionListItem } from '../lib/positionNav';
import type { Trade } from '../types';

vi.mock('../api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/quotes')>();
  return { ...actual, fetchHistory: vi.fn(), fetchQuote: vi.fn(), searchSymbols: vi.fn() };
});

vi.mock('../db/trades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/trades')>();
  return { ...actual, listTradesByTicker: vi.fn(actual.listTradesByTicker) };
});

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    subscribeClick: vi.fn(),
    priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
    timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
    remove: vi.fn(),
  })),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
  CandlestickSeries: {},
  LineSeries: {},
  LineStyle: { Dashed: 2 },
}));

let db: IDBPDatabase<TradeReviewDB>;

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'JOBY',
    name: '조비',
    avgCost: 11.36,
    lastTradeAt: '2025-07-10T00:00:00.000Z',
    currentPrice: 12,
    ...overrides,
  };
}

function tradeFixture(overrides: Partial<Trade> = {}): Trade {
  return {
    id: crypto.randomUUID(),
    ticker: 'JOBY',
    market: 'US',
    name: '조비',
    currency: 'USD',
    datetime: '2025-07-10T00:00:00.000Z',
    datetimeUnknown: false,
    side: 'buy',
    price: 11.36,
    quantityType: 'shares',
    quantityValue: 100,
    quantity: 100,
    fxRateAtTrade: null,
    rationaleTagIds: [],
    conviction: null,
    memo: '',
    attachment: null,
    recordedAt: '2025-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  db = await openTradeReviewDB();
  vi.mocked(quotes.fetchHistory).mockResolvedValue([
    { date: '2025-07-10', open: 11.36, high: 11.36, low: 11.36, close: 11.36 },
  ]);
  vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 11.36, currency: 'USD' });
  vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
  const actualTrades = await vi.importActual<typeof import('../db/trades')>('../db/trades');
  vi.mocked(tradesModule.listTradesByTicker).mockImplementation(actualTrades.listTradesByTicker);
});

afterEach(() => db.close());

describe('ChartScreen', () => {
  it('renders the chart immediately for a ticker with no saved trades yet', async () => {
    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();
  });

  it('disables both navigation arrows when the ticker has no position yet', async () => {
    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: '이전 종목' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 종목' })).toBeDisabled();
  });

  it('navigates to the next position in sorted order when the next arrow is clicked', async () => {
    const onSelectTicker = vi.fn();
    render(
      <ChartScreen
        db={db}
        ticker="AAPL"
        name="Apple Inc."
        tags={[]}
        positions={[item({ ticker: 'AAPL', name: 'Apple Inc.', lastTradeAt: '2025-07-11T00:00:00.000Z' }), item()]}
        sortOrder="recent"
        onSelectTicker={onSelectTicker}
        onTradeSaved={vi.fn()}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: '다음 종목' }));
    expect(onSelectTicker).toHaveBeenCalledWith('JOBY', '조비');
  });

  it('opens the add-trade sheet and reports the saved trade, then closes the sheet', async () => {
    const onTradeSaved = vi.fn();
    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={onTradeSaved}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: '+ 매매 기록 추가' }));
    await screen.findByRole('dialog', { name: '매매 기록 추가' });
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    await waitFor(() => {
      expect(onTradeSaved).toHaveBeenCalledOnce();
      expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument();
    });
  });

  it("opens the trade-list sheet and shows a saved trade's detail on selection", async () => {
    await createTrade(db, {
      ticker: 'JOBY',
      market: 'US',
      name: '조비',
      currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z',
      datetimeUnknown: false,
      side: 'buy',
      price: 11.36,
      quantityType: 'shares',
      quantityValue: 100,
      fxRateAtTrade: null,
      rationaleTagIds: [],
      conviction: null,
      memo: '',
      attachment: null,
    });

    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[item()]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: '매매 목록' }));
    await screen.findByRole('dialog', { name: '매매 목록 시트' });
    await userEvent.click(await screen.findByRole('button', { name: /매수 11.36/ }));

    expect(await screen.findByRole('dialog', { name: '매매 상세' })).toBeInTheDocument();
  });

  it('discards a slow-to-resolve response for a ticker that is no longer displayed after a fast switch', async () => {
    const aTrades = deferred<Trade[]>();
    const bTrades = deferred<Trade[]>();
    const promiseByTicker: Record<string, Promise<Trade[]>> = { AAPL: aTrades.promise, JOBY: bTrades.promise };
    vi.mocked(tradesModule.listTradesByTicker).mockImplementation((_db, ticker) => promiseByTicker[ticker]);

    const { rerender } = render(
      <ChartScreen
        db={db}
        ticker="AAPL"
        name="Apple Inc."
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    // Simulate clicking the nav arrow twice quickly: switch to JOBY before AAPL's request resolves.
    rerender(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    // JOBY's (current ticker's) response arrives first...
    bTrades.resolve([tradeFixture({ ticker: 'JOBY', price: 22.5 })]);
    await userEvent.click(await screen.findByRole('button', { name: '매매 목록' }));
    await screen.findByRole('dialog', { name: '매매 목록 시트' });
    expect(await screen.findByRole('button', { name: /매수 22.5/ })).toBeInTheDocument();

    // ...then AAPL's stale response resolves late and must be silently dropped.
    aTrades.resolve([tradeFixture({ ticker: 'AAPL', price: 99.9 })]);
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByRole('button', { name: /매수 99.9/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /매수 22.5/ })).toBeInTheDocument();
  });

  it('calls window.history.back() when the home button is clicked', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: '홈' }));
    expect(backSpy).toHaveBeenCalledOnce();
    backSpy.mockRestore();
  });
});
