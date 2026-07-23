import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTrade } from './trades';
import { listAllTrades } from './allTrades';

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

describe('listAllTrades', () => {
  it('returns every trade across every ticker', async () => {
    await createTrade(db, {
      ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 11.36, quantityType: 'shares', quantityValue: 100,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });
    await createTrade(db, {
      ticker: 'AAPL', market: 'US', name: 'Apple', currency: 'USD',
      datetime: '2025-07-11T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 200, quantityType: 'shares', quantityValue: 1,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });
    const all = await listAllTrades(db);
    expect(all).toHaveLength(2);
  });
});
