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
  const rationaleLabel = tagNames.length > 0 ? tagNames.join(', ') : '이 매매, 기억나는 이유가 있나요?';

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(trade)}
        className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {dateLabel} · {trade.side === 'buy' ? '매수' : '매도'} {trade.price} · {rationaleLabel}
      </button>
      {trade.memo && (
        <div className="px-3 pb-2">
          <p className={expanded ? 'text-xs text-zinc-500 dark:text-zinc-400' : 'line-clamp-3 text-xs text-zinc-500 dark:text-zinc-400'}>
            {trade.memo}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="mt-1 text-xs font-bold text-accent"
          >
            {expanded ? '접기' : '더보기'}
          </button>
        </div>
      )}
    </li>
  );
}

export function TradeList({ trades, tags, onSelect }: TradeListProps) {
  return (
    <ul aria-label="매매 목록" className="flex flex-col gap-1">
      {trades.map((trade) => (
        <TradeRow key={trade.id} trade={trade} tags={tags} onSelect={onSelect} />
      ))}
    </ul>
  );
}
