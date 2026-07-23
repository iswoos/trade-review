import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Trade } from '../types';

export async function listAllTrades(db: IDBPDatabase<TradeReviewDB>): Promise<Trade[]> {
  return db.getAll('trades');
}

export async function putAllTrades(db: IDBPDatabase<TradeReviewDB>, trades: Trade[]): Promise<void> {
  const tx = db.transaction('trades', 'readwrite');
  await Promise.all(trades.map((trade) => tx.store.put(trade)));
  await tx.done;
}
