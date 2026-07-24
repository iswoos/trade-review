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
    <div role="dialog" aria-label="매매 상세" className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {trade.side === 'buy' ? '매수' : '매도'} · {trade.price}
      </p>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">수량: {trade.quantity}</p>
      {tagNames.length > 0 ? (
        <ul className="text-sm text-zinc-700 dark:text-zinc-300">
          {tagNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">이 매매, 기억나는 이유가 있나요?</p>
      )}
      {trade.memo && <p className="text-sm text-zinc-700 dark:text-zinc-300">{trade.memo}</p>}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 rounded-xl border border-zinc-200 px-3 py-1 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        닫기
      </button>
    </div>
  );
}
