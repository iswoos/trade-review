import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTrade, listTradesByTicker, updateTrade, deleteTrade } from './trades';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  const deleteRequest = indexedDB.deleteDatabase('trade-review');
  await new Promise<void>((resolve, reject) => {
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
  db = await openTradeReviewDB();
}, 30000);

afterEach(() => {
  db.close();
});

function baseInput(overrides: Partial<Parameters<typeof createTrade>[1]> = {}) {
  return {
    ticker: 'JOBY',
    market: 'US' as const,
    name: '조비',
    currency: 'USD' as const,
    datetime: '2025-07-10T00:00:00.000Z',
    datetimeUnknown: false,
    side: 'buy' as const,
    price: 11.36,
    quantityType: 'shares' as const,
    quantityValue: 100,
    fxRateAtTrade: null,
    rationaleTagIds: [],
    conviction: null,
    memo: '',
    attachment: null,
    ...overrides,
  };
}

describe('createTrade', () => {
  it('stamps id, recordedAt, and resolved quantity', async () => {
    const trade = await createTrade(db, baseInput());
    expect(trade.id).toBeTruthy();
    expect(trade.recordedAt).toBeTruthy();
    expect(trade.quantity).toBe(100);
  });

  it('resolves quantity for amount-based input using resolveQuantity', async () => {
    const trade = await createTrade(
      db,
      baseInput({ quantityType: 'amount', quantityValue: 1_250_000, price: 17.6, fxRateAtTrade: 1400 })
    );
    expect(trade.quantity).toBeCloseTo(1_250_000 / (17.6 * 1400), 6);
  });
});

describe('listTradesByTicker', () => {
  it('returns only trades for the requested ticker', async () => {
    await createTrade(db, baseInput({ ticker: 'JOBY' }));
    await createTrade(db, baseInput({ ticker: 'AAPL' }));
    const jobyTrades = await listTradesByTicker(db, 'JOBY');
    expect(jobyTrades).toHaveLength(1);
    expect(jobyTrades[0].ticker).toBe('JOBY');
  });
});

describe('updateTrade', () => {
  it('updates trade details and recalculates resolved quantity', async () => {
    const original = await createTrade(db, baseInput({ price: 10, quantityValue: 50 }));
    const updated = await updateTrade(db, original.id, { price: 20, quantityValue: 50, memo: '수정됨' });
    expect(updated.price).toBe(20);
    expect(updated.memo).toBe('수정됨');

    const fetched = await listTradesByTicker(db, 'JOBY');
    expect(fetched[0].price).toBe(20);
    expect(fetched[0].memo).toBe('수정됨');
  });
});

describe('deleteTrade', () => {
  it('removes the trade from indexedDB', async () => {
    const trade = await createTrade(db, baseInput());
    await deleteTrade(db, trade.id);
    const fetched = await listTradesByTicker(db, 'JOBY');
    expect(fetched).toHaveLength(0);
  });
});
