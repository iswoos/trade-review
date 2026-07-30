export interface PositionListItem {
  ticker: string;
  name: string;
  avgCost: number;
  totalQuantity?: number;
  lastTradeAt: string;
  lastTradeRecordedAt?: string;
  currentPrice: number | null;
  dailyChangePercent?: number | null;
  currency?: 'USD' | 'KRW' | null;
  buyCnt: number;
  sellCnt: number;
  noteCnt: number;
}

export interface PortfolioTotal {
  totalInvested: number;
  totalEvaluation: number;
  pnlAmount: number;
  pnlPercent: number;
}

// 종목별 평단/평가금액은 각자의 통화 기준이라(ADR-0001), 원화 합산 총계를 내려면
// USD 포지션만 당일 환율로 원화 환산한다. 환율을 못 구했으면 그 포지션은 총계에서 제외한다
// (원화 항목에 달러 금액을 그대로 더하면 의미 없는 숫자가 되므로).
export function calculatePortfolioTotal(items: PositionListItem[], usdKrwRate: number | null): PortfolioTotal | null {
  let totalInvested = 0;
  let totalEvaluation = 0;
  let counted = false;

  for (const item of items) {
    if (item.currentPrice == null) continue;
    if (item.currency === 'USD' && usdKrwRate == null) continue;

    const quantity = item.totalQuantity ?? 0;
    const rate = item.currency === 'USD' ? usdKrwRate! : 1;
    totalInvested += item.avgCost * quantity * rate;
    totalEvaluation += item.currentPrice * quantity * rate;
    counted = true;
  }

  if (!counted) return null;

  const pnlAmount = totalEvaluation - totalInvested;
  const pnlPercent = totalInvested > 0 ? (pnlAmount / totalInvested) * 100 : 0;
  return { totalInvested, totalEvaluation, pnlAmount, pnlPercent };
}

// 전일 종가를 별도로 저장하지 않고 currentPrice/dailyChangePercent에서 역산한다.
// currentPrice = prevClose * (1 + pct/100) 이므로, 변동액 = currentPrice - prevClose
//              = currentPrice * pct / (100 + pct).
export function dailyChangeAmount(currentPrice: number, dailyChangePercent: number): number {
  const denominator = 100 + dailyChangePercent;
  if (denominator === 0) return 0;
  return (currentPrice * dailyChangePercent) / denominator;
}

export type SortOrder = 'recent' | 'alphabetical' | 'pnl';

function pnlPercent(item: PositionListItem): number {
  if (item.currentPrice == null || item.avgCost === 0) return -Infinity;
  return ((item.currentPrice - item.avgCost) / item.avgCost) * 100;
}

export function sortPositionItems(items: PositionListItem[], order: SortOrder): PositionListItem[] {
  const copy = [...items];
  if (order === 'recent') {
    return copy.sort((a, b) => {
      const byLastTradeAt = b.lastTradeAt.localeCompare(a.lastTradeAt);
      if (byLastTradeAt !== 0) return byLastTradeAt;
      return (b.lastTradeRecordedAt ?? '').localeCompare(a.lastTradeRecordedAt ?? '');
    });
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
