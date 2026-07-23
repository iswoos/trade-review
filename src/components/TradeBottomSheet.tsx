import type { Tag, Trade } from '../types';

interface TradeBottomSheetProps {
  trade: Trade;
  tags: Tag[];
  onClose: () => void;
}

export function TradeBottomSheet({ trade, tags, onClose }: TradeBottomSheetProps) {
  const tagNames = trade.rationaleTagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div role="dialog" aria-label="매매 상세">
      <p>
        {trade.side === 'buy' ? '매수' : '매도'} · {trade.price}
      </p>
      <p>수량: {trade.quantity}</p>
      {tagNames.length > 0 ? (
        <ul>
          {tagNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <p>이 매매, 기억나는 이유가 있나요?</p>
      )}
      {trade.memo && <p>{trade.memo}</p>}
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}
