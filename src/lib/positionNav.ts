export interface PositionListItem {
  ticker: string;
  name: string;
  avgCost: number;
  lastTradeAt: string;
  currentPrice: number | null;
}

export type SortOrder = 'recent' | 'alphabetical' | 'pnl';

function pnlPercent(item: PositionListItem): number {
  if (item.currentPrice == null || item.avgCost === 0) return -Infinity;
  return ((item.currentPrice - item.avgCost) / item.avgCost) * 100;
}

export function sortPositionItems(items: PositionListItem[], order: SortOrder): PositionListItem[] {
  const copy = [...items];
  if (order === 'recent') {
    return copy.sort((a, b) => b.lastTradeAt.localeCompare(a.lastTradeAt));
  }
  if (order === 'alphabetical') {
    return copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }
  return copy.sort((a, b) => pnlPercent(b) - pnlPercent(a));
}

export function adjacentTicker(
  sortedTickers: string[],
  currentTicker: string,
  direction: 'prev' | 'next'
): string | null {
  const index = sortedTickers.indexOf(currentTicker);
  if (index === -1) return null;
  const nextIndex = direction === 'prev' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= sortedTickers.length) return null;
  return sortedTickers[nextIndex];
}
