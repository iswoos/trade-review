import { describe, it, expect } from 'vitest';
import { sortPositionItems, adjacentTicker, type PositionListItem } from './positionNav';

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    avgCost: 100,
    lastTradeAt: '2025-01-01T00:00:00.000Z',
    currentPrice: 110,
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
