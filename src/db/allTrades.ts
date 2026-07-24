import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Trade } from '../types';

export async function listAllTrades(db: IDBPDatabase<TradeReviewDB>): Promise<Trade[]> {
  return db.getAll('trades');
}
