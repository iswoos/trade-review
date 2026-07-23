import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Trade, Tag } from '../types';

export interface TradeReviewDB extends DBSchema {
  trades: {
    key: string;
    value: Trade;
    indexes: { 'by-ticker': string };
  };
  tags: {
    key: string;
    value: Tag;
  };
}

export function openTradeReviewDB(): Promise<IDBPDatabase<TradeReviewDB>> {
  return openDB<TradeReviewDB>('trade-review', 1, {
    upgrade(db) {
      const tradeStore = db.createObjectStore('trades', { keyPath: 'id' });
      tradeStore.createIndex('by-ticker', 'ticker');
      db.createObjectStore('tags', { keyPath: 'id' });
    },
  });
}
