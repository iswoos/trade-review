import { describe, it, expect } from 'vitest';
import {
  sortPositionItems,
  adjacentTicker,
  calculatePortfolioTotal,
  dailyChangeAmount,
  type PositionListItem,
} from './positionNav';

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    avgCost: 100,
    lastTradeAt: '2025-01-01T00:00:00.000Z',
    currentPrice: 110,
    buyCnt: 0,
    sellCnt: 0,
    noteCnt: 0,
    ...overrides,
  };
}

describe('sortPositionItems', () => {
  it('sorts by most recent trade first for "recent"', () => {
    const items = [
      item({ ticker: 'A', lastTradeAt: '2025-01-01T00:00:00.000Z' }),
      item({ ticker: 'B', lastTradeAt: '2025-03-01T00:00:00.000Z' }),
    ];
    expect(sortPositionItems(items, 'recent').map((i) => i.ticker)).toEqual(['B', 'A']);
  });

  it('sorts alphabetically by ticker for "alphabetical"', () => {
    const items = [item({ ticker: 'JOBY' }), item({ ticker: 'AAPL' })];
    expect(sortPositionItems(items, 'alphabetical').map((i) => i.ticker)).toEqual(['AAPL', 'JOBY']);
  });

  it('sorts by unrealized P&L percent, highest first, for "pnl"', () => {
    const items = [
      item({ ticker: 'LOSER', avgCost: 100, currentPrice: 50 }),
      item({ ticker: 'WINNER', avgCost: 100, currentPrice: 150 }),
    ];
    expect(sortPositionItems(items, 'pnl').map((i) => i.ticker)).toEqual(['WINNER', 'LOSER']);
  });

  it('treats a missing current price as lowest priority for "pnl"', () => {
    const items = [item({ ticker: 'UNKNOWN', currentPrice: null }), item({ ticker: 'KNOWN', avgCost: 100, currentPrice: 120 })];
    expect(sortPositionItems(items, 'pnl').map((i) => i.ticker)).toEqual(['KNOWN', 'UNKNOWN']);
  });

  it('does not mutate the input array', () => {
    const items = [item({ ticker: 'B' }), item({ ticker: 'A' })];
    sortPositionItems(items, 'alphabetical');
    expect(items.map((i) => i.ticker)).toEqual(['B', 'A']);
  });

  it('breaks a tie in "recent" order using lastTradeRecordedAt when lastTradeAt is identical', () => {
    const items = [
      item({ ticker: 'A', lastTradeAt: '2025-01-01T00:00:00.000Z', lastTradeRecordedAt: '2025-01-01T00:05:00.000Z' }),
      item({ ticker: 'B', lastTradeAt: '2025-01-01T00:00:00.000Z', lastTradeRecordedAt: '2025-01-01T00:10:00.000Z' }),
    ];
    expect(sortPositionItems(items, 'recent').map((i) => i.ticker)).toEqual(['B', 'A']);
  });
});

describe('adjacentTicker', () => {
  const order = ['AAPL', 'JOBY', 'TSLA'];

  it('returns the previous ticker', () => {
    expect(adjacentTicker(order, 'JOBY', 'prev')).toBe('AAPL');
  });

  it('returns the next ticker', () => {
    expect(adjacentTicker(order, 'JOBY', 'next')).toBe('TSLA');
  });

  it('returns null when already at the start going prev', () => {
    expect(adjacentTicker(order, 'AAPL', 'prev')).toBeNull();
  });

  it('returns null when already at the end going next', () => {
    expect(adjacentTicker(order, 'TSLA', 'next')).toBeNull();
  });

  it('returns null when the current ticker is not in the list', () => {
    expect(adjacentTicker(order, 'GME', 'next')).toBeNull();
  });
});

describe('calculatePortfolioTotal', () => {
  it('sums KRW-only positions directly', () => {
    const items = [
      item({ ticker: 'A', currency: 'KRW', avgCost: 100, currentPrice: 120, totalQuantity: 10 }),
      item({ ticker: 'B', currency: 'KRW', avgCost: 200, currentPrice: 180, totalQuantity: 5 }),
    ];
    const total = calculatePortfolioTotal(items, null);
    expect(total).toEqual({ totalInvested: 2000, totalEvaluation: 2100, pnlAmount: 100, pnlPercent: 5 });
  });

  it('converts USD positions to KRW using the given rate', () => {
    const items = [item({ ticker: 'AAPL', currency: 'USD', avgCost: 100, currentPrice: 110, totalQuantity: 10 })];
    const total = calculatePortfolioTotal(items, 1300);
    expect(total).toEqual({ totalInvested: 1_300_000, totalEvaluation: 1_430_000, pnlAmount: 130_000, pnlPercent: 10 });
  });

  it('excludes a USD position when no exchange rate is available', () => {
    const items = [
      item({ ticker: 'AAPL', currency: 'USD', avgCost: 100, currentPrice: 110, totalQuantity: 10 }),
      item({ ticker: 'KR', currency: 'KRW', avgCost: 1000, currentPrice: 1100, totalQuantity: 1 }),
    ];
    const total = calculatePortfolioTotal(items, null);
    expect(total).toEqual({ totalInvested: 1000, totalEvaluation: 1100, pnlAmount: 100, pnlPercent: 10 });
  });

  it('excludes positions without a current price', () => {
    const items = [item({ ticker: 'UNKNOWN', currency: 'KRW', currentPrice: null })];
    expect(calculatePortfolioTotal(items, null)).toBeNull();
  });

  it('returns null when there are no positions', () => {
    expect(calculatePortfolioTotal([], null)).toBeNull();
  });
});

describe('dailyChangeAmount', () => {
  it('derives the price change from the current price and percent', () => {
    // prevClose = 100, currentPrice = 105 -> pct = 5
    expect(dailyChangeAmount(105, 5)).toBeCloseTo(5);
  });

  it('handles a negative percent', () => {
    // prevClose = 100, currentPrice = 95 -> pct = -5
    expect(dailyChangeAmount(95, -5)).toBeCloseTo(-5);
  });

  it('returns 0 for a 0% change', () => {
    expect(dailyChangeAmount(100, 0)).toBe(0);
  });
});
