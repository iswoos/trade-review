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

export async function updateTrade(
  db: IDBPDatabase<TradeReviewDB>,
  id: string,
  input: Partial<NewTradeInput>
): Promise<Trade> {
  const existing = await db.get('trades', id);
  if (!existing) throw new Error(`Trade not found: ${id}`);

  const nextType = input.quantityType ?? existing.quantityType;
  const nextValue = input.quantityValue ?? existing.quantityValue;
  const nextPrice = input.price ?? existing.price;
  const nextCurrency = input.currency ?? existing.currency;
  const nextFx = input.fxRateAtTrade !== undefined ? input.fxRateAtTrade : existing.fxRateAtTrade;

  const quantity = resolveQuantity({
    quantityType: nextType,
    quantityValue: nextValue,
    price: nextPrice,
    tickerCurrency: nextCurrency,
    fxRateAtTrade: nextFx,
  });

  const updated: Trade = {
    ...existing,
    ...input,
    quantity,
  };
  await db.put('trades', updated);
  return updated;
}

export async function deleteTrade(db: IDBPDatabase<TradeReviewDB>, id: string): Promise<void> {
  await db.delete('trades', id);
}
