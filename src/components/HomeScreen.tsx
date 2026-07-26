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
          const totalQuantity = item.totalQuantity ?? 0;
          const totalInvested = item.avgCost * totalQuantity;
          const totalEvaluation =
            item.currentPrice != null ? item.currentPrice * totalQuantity : null;
          const rawPnl =
            totalEvaluation != null ? totalEvaluation - totalInvested : null;
          const pnlAmount = rawPnl != null ? (Math.abs(rawPnl) < 0.5 ? 0 : Math.round(rawPnl)) : null;

          const rawPnlPercent =
            item.currentPrice != null && item.avgCost > 0
              ? ((item.currentPrice - item.avgCost) / item.avgCost) * 100
              : null;
          const pnlPercent = rawPnlPercent != null ? (Math.abs(rawPnlPercent) < 0.05 ? 0 : rawPnlPercent) : null;

          const isLoss = pnlPercent != null && pnlPercent < 0;
          const isProfit = pnlPercent != null && pnlPercent > 0;

          const dailyChange = item.dailyChangePercent;
          const isDailyLoss = dailyChange != null && dailyChange < 0;
          const isDailyProfit = dailyChange != null && dailyChange > 0;

          const formattedQty = Number.isInteger(totalQuantity)
            ? totalQuantity.toLocaleString()
            : Number(totalQuantity.toFixed(2)).toLocaleString();

          return (
            <li key={item.ticker}>
              <button
                type="button"
                onClick={() => onSelectTicker(item.ticker, item.name)}
                className="flex w-full flex-col gap-2.5 rounded-2xl border border-zinc-200/80 bg-white p-4 text-left shadow-sm transition active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between w-full">
                  <div className="flex flex-col">
                    <span className="text-base font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                      {item.name || item.ticker}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{item.ticker}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    {item.currentPrice != null && (
                      <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-50 font-mono">
                        {item.currentPrice.toLocaleString()}
                      </span>
                    )}
                    {dailyChange != null ? (
                      <span
                        className={
                          isDailyLoss
                            ? 'mt-0.5 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
                            : isDailyProfit
                            ? 'mt-0.5 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                            : 'mt-0.5 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                        }
                        title="전일 대비 등락률"
                      >
                        {dailyChange > 0 ? '+' : ''}
                        {dailyChange.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="mt-0.5 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                        전일대비 -
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-50/80 border border-zinc-100/80 dark:border-zinc-800/50 dark:bg-zinc-800/40 text-[0.72rem] overflow-hidden">
                  {/* 평단가 · 보유수량 · 평가손익 */}
                  <div className="grid grid-cols-3 gap-2 p-2.5">
                    <div className="flex flex-col">
                      <span className="text-zinc-400 dark:text-zinc-500">평단가</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200 font-mono">
                        {item.avgCost.toLocaleString()} <span className="text-[0.65rem] font-normal text-zinc-400">원</span>
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-zinc-400 dark:text-zinc-500">보유수량</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200 font-mono">
                        {formattedQty} <span className="text-[0.65rem] font-normal text-zinc-400">주</span>
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-zinc-400 dark:text-zinc-500">평가손익 (수익률)</span>
                      {pnlAmount != null ? (
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <span
                            className={
                              isLoss
                                ? 'font-black text-blue-600 dark:text-blue-400 font-mono'
                                : isProfit
                                ? 'font-black text-rose-600 dark:text-rose-400 font-mono'
                                : 'font-bold text-zinc-600 dark:text-zinc-400 font-mono'
                            }
                          >
                            {pnlAmount > 0 ? '+' : ''}
                            {pnlAmount.toLocaleString()}
                          </span>
                          {pnlPercent != null && (
                            <span
                              className={
                                isLoss
                                  ? 'text-[0.68rem] font-bold text-blue-600 dark:text-blue-400 font-mono'
                                  : isProfit
                                  ? 'text-[0.68rem] font-bold text-rose-600 dark:text-rose-400 font-mono'
                                  : 'text-[0.68rem] font-bold text-zinc-500 dark:text-zinc-400 font-mono'
                              }
                            >
                              ({pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400 font-mono">-</span>
                      )}
                    </div>
                  </div>

                  {/* 구분선 */}
                  <div className="mx-2.5 h-[1px] bg-zinc-200/70 dark:bg-zinc-700/50" />

                  {/* 매입금액 · 평가금액 */}
                  <div className="grid grid-cols-2 gap-2 px-2.5 py-2">
                    <div className="flex flex-col">
                      <span className="text-zinc-400 dark:text-zinc-500">매입금액</span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300 font-mono">
                        {totalInvested > 0
                          ? totalInvested.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : '-'}
                        {totalInvested > 0 && (
                          <span className="text-[0.65rem] font-normal text-zinc-400"> 원</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-zinc-400 dark:text-zinc-500">평가금액</span>
                      {totalEvaluation != null ? (
                        <span className="font-bold font-mono">
                          <span
                            className={
                              isLoss
                                ? 'text-blue-600 dark:text-blue-400'
                                : isProfit
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-zinc-700 dark:text-zinc-300'
                            }
                          >
                            {totalEvaluation.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[0.65rem] font-normal text-zinc-400 dark:text-zinc-500"> 원</span>
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-mono">-</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 매수/매도/메모 기록 카운트 뱃지 */}
                {(item.buyCnt > 0 || item.sellCnt > 0 || item.noteCnt > 0) && (
                  <div className="flex items-center gap-1.5">
                    {item.buyCnt > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[0.67rem] font-semibold text-rose-500 dark:bg-rose-950/40 dark:text-rose-400">
                        <span aria-hidden>🔴</span>
                        매수 {item.buyCnt}
                      </span>
                    )}
                    {item.sellCnt > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[0.67rem] font-semibold text-blue-500 dark:bg-blue-950/40 dark:text-blue-400">
                        <span aria-hidden>🔵</span>
                        매도 {item.sellCnt}
                      </span>
                    )}
                    {item.noteCnt > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.67rem] font-semibold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                        <span aria-hidden>📝</span>
                        메모 {item.noteCnt}
                      </span>
                    )}
                  </div>
                )}
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
