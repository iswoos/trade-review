import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Position, Trade } from '../types';
import { EMPTY_POSITION_STATE, applyBuy, applySell } from '../lib/avgCost';
import { listTradesByTicker } from './trades';

function occurredAt(trade: Trade): string {
  return trade.datetime ?? trade.recordedAt;
}

function sortByOccurredAt(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => occurredAt(a).localeCompare(occurredAt(b)));
}

export async function getPosition(db: IDBPDatabase<TradeReviewDB>, ticker: string): Promise<Position> {
  const trades = sortByOccurredAt(await listTradesByTicker(db, ticker));
  let state = EMPTY_POSITION_STATE;
  const avgCostHistory: { at: string; avgCost: number }[] = [];

  for (const trade of trades) {
    state =
      trade.side === 'buy'
        ? applyBuy(state, trade.price, trade.quantity)
        : applySell(state, trade.price, trade.quantity);
    avgCostHistory.push({ at: occurredAt(trade), avgCost: state.avgCost });
  }

  return {
    ticker,
    name: trades[0]?.name ?? ticker,
    avgCost: state.avgCost,
    totalQuantity: state.totalQuantity,
    avgCostHistory,
    realizedPl: state.realizedPl,
  };
}
