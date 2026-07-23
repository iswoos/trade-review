import type { Tag, Trade } from '../types';

interface TradeListProps {
  trades: Trade[];
  tags: Tag[];
  onSelect: (trade: Trade) => void;
}

export function TradeList({ trades, tags, onSelect }: TradeListProps) {
  return (
    <ul aria-label="매매 목록">
      {trades.map((trade) => {
        const tagNames = trade.rationaleTagIds
          .map((id) => tags.find((tag) => tag.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        const dateLabel = (trade.datetime ?? '날짜 모름').slice(0, 10);
        const rationaleLabel = tagNames.length > 0 ? tagNames.join(', ') : '이 매매, 기억나는 이유가 있나요?';
        return (
          <li key={trade.id}>
            <button type="button" onClick={() => onSelect(trade)}>
              {dateLabel} · {trade.side === 'buy' ? '매수' : '매도'} {trade.price} · {rationaleLabel}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
