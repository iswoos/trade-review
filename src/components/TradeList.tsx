import { Fragment, useMemo, useState } from 'react';
import type { Tag, Trade } from '../types';
import { TradeCalendar } from './TradeCalendar';

interface TradeListProps {
  trades: Trade[];
  tags: Tag[];
  onSelect: (trade: Trade) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatTradeDate(dateStr?: string | null) {
  if (!dateStr) return { yearMonth: '', formattedDate: '날짜 모름' };
  const dateOnly = dateStr.slice(0, 10);
  const parts = dateOnly.split('-');
  if (parts.length < 3) return { yearMonth: dateOnly, formattedDate: dateOnly };

  const yyyy = parts[0];
  const mm = parts[1];
  const dd = parts[2];
  const d = new Date(`${dateOnly}T00:00:00Z`);
  const dayName = WEEKDAYS[d.getUTCDay()];

  return {
    yearMonth: `${yyyy}년 ${mm}월`,
    formattedDate: `${mm}.${dd} (${dayName})`,
  };
}

function TradeRow({ trade, tags, onSelect }: { trade: Trade; tags: Tag[]; onSelect: (trade: Trade) => void }) {
  const [expanded, setExpanded] = useState(false);
  const tagNames = trade.rationaleTagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  
  const { formattedDate } = formatTradeDate(trade.datetime);
  const isBuy = trade.side === 'buy';
  const isNote = trade.side === 'note';
  const currencySymbol = trade.currency === 'KRW' ? '원' : '$';

  const lineCount = trade.memo ? trade.memo.split('\n').length : 0;
  const isOverflowing = (trade.memo && trade.memo.length > 50) || lineCount > 3;

  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <button
        type="button"
        onClick={() => onSelect(trade)}
        className="w-full text-left focus:outline-none"
        aria-label={`${trade.datetime ? trade.datetime.slice(0, 10) : ''} ${formattedDate} ${isNote ? '메모' : isBuy ? '매수' : '매도'} ${trade.price}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-black text-white ${
                isNote ? 'bg-amber-600 dark:bg-amber-500' : isBuy ? 'bg-buy' : 'bg-sell'
              }`}
            >
              {isNote ? '📝 메모' : isBuy ? '매수' : '매도'}
            </span>
            <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200/50 dark:border-zinc-700/50">
              {formattedDate}
            </span>
          </div>
          {!isNote && (
            <div className="text-right">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50 font-mono">
                {trade.price.toLocaleString()} {currencySymbol}
              </span>
              <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                ({trade.quantity.toLocaleString()}주)
              </span>
            </div>
          )}
        </div>

        <div className="mt-2.5">
          {tagNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tagNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  #{name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">이 매매, 기억나는 이유가 있나요?</p>
          )}
        </div>
      </button>

      {trade.memo && (
        <div className="mt-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800/60">
          <p
            className={
              expanded
                ? 'text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap'
                : 'line-clamp-3 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap'
            }
          >
            {trade.memo}
          </p>
          {isOverflowing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
              className="mt-1.5 text-xs font-bold text-accent hover:underline"
            >
              {expanded ? '접기' : '더보기'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function TradeList({ trades, tags, onSelect }: TradeListProps) {
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'note'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const sortedTrades = useMemo(() => {
    return [...trades].sort((a, b) => {
      const timeA = a.datetime ?? '';
      const timeB = b.datetime ?? '';
      const cmp = timeB.localeCompare(timeA);
      if (cmp !== 0) {
        return sortOrder === 'desc' ? cmp : -cmp;
      }
      const recA = a.recordedAt ?? '';
      const recB = b.recordedAt ?? '';
      return sortOrder === 'desc' ? recB.localeCompare(recA) : recA.localeCompare(recB);
    });
  }, [trades, sortOrder]);

  const buyCount = sortedTrades.filter((t) => t.side === 'buy').length;
  const sellCount = sortedTrades.filter((t) => t.side === 'sell').length;
  const noteCount = sortedTrades.filter((t) => t.side === 'note').length;

  const filteredTrades = sortedTrades.filter((t) => {
    if (filter === 'all') return true;
    return t.side === filter;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* View Mode Switcher Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300">매매 및 메모 내역</h3>
        <div role="radiogroup" aria-label="보기 방식" className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800 text-xs font-bold">
          <button
            type="button"
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            className={`rounded-lg px-2.5 py-1 transition ${
              viewMode === 'list'
                ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
            }`}
          >
            ☰ 목록
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'calendar'}
            onClick={() => setViewMode('calendar')}
            className={`rounded-lg px-2.5 py-1 transition ${
              viewMode === 'calendar'
                ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
            }`}
          >
            📅 달력
          </button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <TradeCalendar trades={trades} onSelect={onSelect} />
      ) : (
        <>
          {/* Header Row: Category Filter Chips & Sort Toggle */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2 dark:border-zinc-800">
            <div role="radiogroup" aria-label="기록 필터" className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs font-bold scrollbar-none">
              <button
                type="button"
                aria-pressed={filter === 'all'}
                onClick={() => setFilter('all')}
                className={`rounded-xl px-3 py-1.5 transition ${
                  filter === 'all'
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                전체 ({trades.length})
              </button>
              <button
                type="button"
                aria-pressed={filter === 'buy'}
                onClick={() => setFilter('buy')}
                className={`rounded-xl px-3 py-1.5 transition ${
                  filter === 'buy'
                    ? 'bg-buy text-white shadow-sm'
                    : 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400'
                }`}
              >
                🔴 매수 ({buyCount})
              </button>
              <button
                type="button"
                aria-pressed={filter === 'sell'}
                onClick={() => setFilter('sell')}
                className={`rounded-xl px-3 py-1.5 transition ${
                  filter === 'sell'
                    ? 'bg-sell text-white shadow-sm'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400'
                }`}
              >
                🔵 매도 ({sellCount})
              </button>
              <button
                type="button"
                aria-pressed={filter === 'note'}
                onClick={() => setFilter('note')}
                className={`rounded-xl px-3 py-1.5 transition ${
                  filter === 'note'
                    ? 'bg-amber-600 text-white shadow-sm dark:bg-amber-500'
                    : 'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400'
                }`}
              >
                📝 메모 ({noteCount})
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[0.68rem] font-bold text-zinc-600 shadow-sm transition hover:bg-zinc-50 active:scale-95 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              title="날짜 정렬 변경"
            >
              <span>{sortOrder === 'desc' ? '↓ 최신순' : '↑ 과거순'}</span>
            </button>
          </div>

          <ul aria-label="매매 목록" className="flex flex-col gap-2.5">
            {filteredTrades.length > 0 ? (
              filteredTrades.map((trade, index) => {
                const { yearMonth } = formatTradeDate(trade.datetime);
                const prevYearMonth =
                  index > 0 ? formatTradeDate(filteredTrades[index - 1].datetime).yearMonth : null;
                const isNewYearMonthGroup = yearMonth && yearMonth !== prevYearMonth;

                return (
                  <Fragment key={trade.id}>
                    {isNewYearMonthGroup && (
                      <li className="mt-2 mb-0.5 flex items-center gap-2">
                        <span className="rounded-full bg-zinc-900/90 px-3 py-0.5 text-[0.68rem] font-black text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs">
                          🗓️ {yearMonth}
                        </span>
                        <div className="h-[1px] flex-1 bg-zinc-200/80 dark:bg-zinc-800/80" />
                      </li>
                    )}
                    <TradeRow trade={trade} tags={tags} onSelect={onSelect} />
                  </Fragment>
                );
              })
            ) : (
              <li className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-xs italic text-zinc-400 dark:border-zinc-800">
                해당하는 기록 내역이 없습니다.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
