import { useState } from 'react';
import type { Tag, Trade } from '../types';

interface TradeListProps {
  trades: Trade[];
  tags: Tag[];
  onSelect: (trade: Trade) => void;
}

function TradeRow({ trade, tags, onSelect }: { trade: Trade; tags: Tag[]; onSelect: (trade: Trade) => void }) {
  const [expanded, setExpanded] = useState(false);
  const tagNames = trade.rationaleTagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const dateLabel = (trade.datetime ?? '날짜 모름').slice(0, 10);
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
        aria-label={`${dateLabel} ${isNote ? '메모' : isBuy ? '매수' : '매도'} ${trade.price}`}
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
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{dateLabel}</span>
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
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'note'>('all');

  const buyCount = trades.filter((t) => t.side === 'buy').length;
  const sellCount = trades.filter((t) => t.side === 'sell').length;
  const noteCount = trades.filter((t) => t.side === 'note').length;

  const filteredTrades = trades.filter((t) => {
    if (filter === 'all') return true;
    return t.side === filter;
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Category Filter Chips Bar */}
      <div role="radiogroup" aria-label="기록 필터" className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 text-xs font-bold scrollbar-none">
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

      <ul aria-label="매매 목록" className="flex flex-col gap-2.5">
        {filteredTrades.length > 0 ? (
          filteredTrades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} tags={tags} onSelect={onSelect} />
          ))
        ) : (
          <li className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-xs italic text-zinc-400 dark:border-zinc-800">
            해당하는 기록 내역이 없습니다.
          </li>
        )}
      </ul>
    </div>
  );
}
