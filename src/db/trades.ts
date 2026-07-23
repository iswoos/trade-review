import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Trade } from '../types';
import { resolveQuantity } from '../lib/quantity';

export type NewTradeInput = Omit<Trade, 'id' | 'recordedAt' | 'quantity'>;

export async function createTrade(db: IDBPDatabase<TradeReviewDB>, input: NewTradeInput): Promise<Trade> {
  const quantity = resolveQuantity({
    quantityType: input.quantityType,
    quantityValue: input.quantityValue,
    price: input.price,
    tickerCurrency: input.currency,
    fxRateAtTrade: input.fxRateAtTrade,
  });
  const trade: Trade = {
    ...input,
    id: crypto.randomUUID(),
    quantity,
    recordedAt: new Date().toISOString(),
  };
  await db.put('trades', trade);
  return trade;
}

export async function listTradesByTicker(db: IDBPDatabase<TradeReviewDB>, ticker: string): Promise<Trade[]> {
  return db.getAllFromIndex('trades', 'by-ticker', ticker);
}
