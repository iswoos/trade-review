import { TickerSearch } from './TickerSearch';
import { ThemeToggle } from './ThemeToggle';
import { sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

interface HomeScreenProps {
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onSelectTicker: (ticker: string, name: string) => void;
  onOpenTagManagement: () => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: '최근 매매순',
  alphabetical: '이름순',
  pnl: '평가손익순',
};

export function HomeScreen({ positions, sortOrder, onSortOrderChange, onSelectTicker, onOpenTagManagement }: HomeScreenProps) {
  const sorted = sortPositionItems(positions, sortOrder);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        </div>
        <button
          type="button"
          onClick={onOpenTagManagement}
          aria-label="태그 관리"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          🏷️
        </button>
        <ThemeToggle />
      </div>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">보유 주식</h2>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          정렬 기준
          <select
            aria-label="정렬 기준"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
            className="ml-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
              <option key={order} value={order}>
                {SORT_LABELS[order]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul aria-label="보유 주식 목록" className="flex flex-col gap-2.5">
        {sorted.map((item) => {
          const pnlPercent =
            item.currentPrice != null && item.avgCost > 0
              ? ((item.currentPrice - item.avgCost) / item.avgCost) * 100
              : null;
          const isLoss = pnlPercent != null && pnlPercent < 0;
          return (
            <li key={item.ticker}>
              <button
                type="button"
                onClick={() => onSelectTicker(item.ticker, item.name)}
                className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm shadow-zinc-900/5 transition active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="flex flex-col">
                  <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {item.ticker}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.name}</span>
                  <span className="mt-0.5 text-[0.68rem] text-zinc-400 dark:text-zinc-500">평단 {item.avgCost}</span>
                </span>
                <span className="flex flex-col items-end">
                  {item.currentPrice != null && (
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      현재가 {item.currentPrice}
                    </span>
                  )}
                  {pnlPercent != null && (
                    <span
                      className={
                        isLoss
                          ? 'mt-1 rounded-full bg-loss/10 px-2 py-0.5 text-xs font-bold text-loss'
                          : 'mt-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent'
                      }
                    >
                      {pnlPercent >= 0 ? '+' : ''}
                      {pnlPercent.toFixed(1)}%
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <a
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noreferrer"
        className="text-center text-[0.65rem] text-zinc-400 dark:text-zinc-600"
      >
        Powered by TradingView Lightweight Charts
      </a>
    </div>
  );
}
