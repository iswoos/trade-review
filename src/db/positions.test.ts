import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTrade } from './trades';
import { getPosition, listPositions } from './positions';

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

function tradeInput(overrides: Partial<Parameters<typeof createTrade>[1]> = {}) {
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

describe('getPosition', () => {
  it('derives avgCost/totalQuantity/realizedPl from stored trades, ordered by datetime', async () => {
    await createTrade(db, tradeInput({ side: 'buy', price: 10, quantityValue: 10, datetime: '2025-01-01T00:00:00.000Z' }));
    await createTrade(db, tradeInput({ side: 'buy', price: 20, quantityValue: 10, datetime: '2025-01-02T00:00:00.000Z' }));
    await createTrade(db, tradeInput({ side: 'sell', price: 25, quantityValue: 5, datetime: '2025-01-03T00:00:00.000Z' }));

    const position = await getPosition(db, 'JOBY');

    expect(position.ticker).toBe('JOBY');
    expect(position.totalQuantity).toBe(15);
    expect(position.avgCost).toBeCloseTo(15, 6); // unaffected by the sell
    expect(position.realizedPl).toBeCloseTo((25 - 15) * 5, 6);
    expect(position.avgCostHistory).toHaveLength(3);
  });

  it('falls back to recordedAt ordering when datetime is null (unknown-time trades)', async () => {
    await createTrade(db, tradeInput({ datetime: null, datetimeUnknown: true, price: 10, quantityValue: 10 }));
    const position = await getPosition(db, 'JOBY');
    expect(position.totalQuantity).toBe(10);
  });
});

describe('listPositions', () => {
  it('returns one Position per distinct ticker across all stored trades', async () => {
    await createTrade(
      db,
      tradeInput({ ticker: 'JOBY', name: '조비', price: 10, quantityValue: 10, datetime: '2025-01-01T00:00:00.000Z' })
    );
    await createTrade(
      db,
      tradeInput({ ticker: 'AAPL', name: 'Apple Inc.', price: 100, quantityValue: 5, datetime: '2025-01-02T00:00:00.000Z' })
    );

    const positions = await listPositions(db);

    expect(positions.map((p) => p.ticker).sort()).toEqual(['AAPL', 'JOBY']);
    const aapl = positions.find((p) => p.ticker === 'AAPL');
    expect(aapl?.avgCost).toBeCloseTo(100, 6);
  });

  it('returns an empty array when there are no trades at all', async () => {
    expect(await listPositions(db)).toEqual([]);
  });
});
