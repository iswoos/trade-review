import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTrade } from '../db/trades';
import { StockDetail } from './StockDetail';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/quotes')>();
  return { ...actual, fetchHistory: vi.fn() };
});

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() })),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
  LineStyle: { Dashed: 2 },
}));

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
  vi.mocked(quotes.fetchHistory).mockResolvedValue([{ date: '2025-07-10', close: 11.36 }]);
});

describe('StockDetail', () => {
  it('switches between 차트 and 목록 tabs', async () => {
    await createTrade(db, {
      ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 11.36, quantityType: 'shares', quantityValue: 100,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });

    render(<StockDetail db={db} ticker="JOBY" tags={[]} />);

    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(await screen.findByRole('list', { name: '매매 목록' })).toBeInTheDocument();
  });
});
