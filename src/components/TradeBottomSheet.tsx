import { useState } from 'react';
import type { Tag, Trade } from '../types';

interface TradeBottomSheetProps {
  trade: Trade;
  tags: Tag[];
  tradesOnSameDate?: Trade[];
  onClose: () => void;
  onEdit?: (trade: Trade) => void;
  onDelete?: (trade: Trade) => void;
}

export function TradeBottomSheet({
  trade: initialTrade,
  tags,
  tradesOnSameDate = [],
  onClose,
  onEdit,
  onDelete,
}: TradeBottomSheetProps) {
  const [activeTrade, setActiveTrade] = useState<Trade>(initialTrade);

  const availableTrades = tradesOnSameDate.length > 0 ? tradesOnSameDate : [initialTrade];

  const tagNames = activeTrade.rationaleTagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const isBuy = activeTrade.side === 'buy';
  const currencySymbol = activeTrade.currency === 'KRW' ? '원' : '$';
  const totalAmount = activeTrade.price * activeTrade.quantity;
  const dateFormatted = activeTrade.datetime ? activeTrade.datetime.slice(0, 10) : '날짜 없음';
  const timeFormatted = activeTrade.datetime && activeTrade.datetime.includes('T')
    ? activeTrade.datetime.split('T')[1].slice(0, 5)
    : '';

  return (
    <div
      role="dialog"
      aria-label="매매 상세"
      className="w-full max-h-[85vh] overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />

      {availableTrades.length > 1 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {availableTrades.map((t, idx) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTrade(t)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                t.id === activeTrade.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              #{idx + 1} {t.side === 'buy' ? '매수' : '매도'} ({t.price.toLocaleString()}{currencySymbol})
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-lg px-2.5 py-1 text-xs font-black tracking-wider text-white shadow-sm ${
              isBuy ? 'bg-buy' : 'bg-sell'
            }`}
          >
            {isBuy ? 'BUY 매수' : 'SELL 매도'}
          </span>
          <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            {dateFormatted} {timeFormatted}
          </span>
        </div>
        <span className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
          {activeTrade.name} ({activeTrade.ticker})
        </span>
      </div>

      <div className="my-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">체결단가</p>
          <p className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
            {activeTrade.price.toLocaleString()} {currencySymbol}
          </p>
        </div>
        <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">체결수량</p>
          <p className="mt-0.5 text-base font-bold text-zinc-900 dark:text-zinc-100">
            {activeTrade.quantity.toLocaleString()} 주
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl bg-zinc-100/70 px-3.5 py-2.5 dark:bg-zinc-800/30">
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">총 거래금액</span>
        <span className="text-sm font-extrabold text-zinc-900 dark:text-zinc-100">
          {totalAmount.toLocaleString()} {currencySymbol}
        </span>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">매매 이유 태그</p>
        {tagNames.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tagNames.map((name) => (
              <span
                key={name}
                className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent dark:bg-accent/20"
              >
                #{name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">이 매매, 기억나는 이유가 있나요?</p>
        )}
      </div>

      {activeTrade.memo && (
        <div className="mb-5 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-800/20">
          <p className="mb-1 text-xs font-bold text-zinc-400 dark:text-zinc-500">메모</p>
          <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
            {activeTrade.memo}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(activeTrade)}
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-2.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            수정
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(activeTrade)}
            className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-bold text-rose-600 shadow-sm transition hover:bg-rose-100 active:scale-[0.98] dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/60"
          >
            삭제
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-zinc-200 bg-zinc-100 py-2.5 text-xs font-bold text-zinc-600 transition hover:bg-zinc-200 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
