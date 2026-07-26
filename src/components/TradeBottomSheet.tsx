import { useState, useRef } from 'react';
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
  const [translateY, setTranslateY] = useState(0);
  const touchStartY = useRef<number | null>(null);

  const availableTrades = tradesOnSameDate.length > 0 ? tradesOnSameDate : [initialTrade];

  const tagNames = activeTrade.rationaleTagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const isBuy = activeTrade.side === 'buy';
  const isNote = activeTrade.side === 'note';
  const currencySymbol = activeTrade.currency === 'KRW' ? '원' : '$';
  const totalAmount = activeTrade.price * activeTrade.quantity;
  const dateFormatted = activeTrade.datetime ? activeTrade.datetime.slice(0, 10) : '날짜 없음';
  const timeFormatted =
    activeTrade.datetime && activeTrade.datetime.includes('T')
      ? activeTrade.datetime.split('T')[1].slice(0, 5)
      : '';

  const formattedQuantity = Number.isInteger(activeTrade.quantity)
    ? activeTrade.quantity.toLocaleString()
    : Number(activeTrade.quantity.toFixed(4)).toLocaleString();

  function handleTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartY.current == null) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    if (deltaY > 0) {
      setTranslateY(deltaY);
    }
  }

  function handleTouchEnd() {
    if (translateY > 100) {
      onClose();
    } else {
      setTranslateY(0);
    }
    touchStartY.current = null;
  }

  return (
    <div
      role="dialog"
      aria-label="매매 상세"
      style={{
        transform: `translateY(${translateY}px)`,
        transition: translateY === 0 ? 'transform 0.2s ease-out' : 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex flex-col justify-between w-full h-[520px] max-h-[85vh] rounded-t-3xl border border-zinc-200/80 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto pr-1">
        {/* Modal Top Drag Handle Bar & Close X */}
        <div className="relative mb-3 flex items-center justify-between pt-1">
          <div className="w-8" />
          <div className="h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100/80 text-sm font-bold text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            ✕
          </button>
        </div>

        {availableTrades.length > 1 && (
          <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
            {availableTrades.map((t, idx) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTrade(t)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold transition ${
                  t.id === activeTrade.id
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                #{idx + 1} {t.side === 'buy' ? '매수' : t.side === 'sell' ? '매도' : '메모'}
                {t.side !== 'note' ? ` (${t.price.toLocaleString()}${currencySymbol})` : ''}
              </button>
            ))}
          </div>
        )}

        {/* Ticker & Side Header */}
        <div className="mb-4 border-b border-zinc-100 pb-3.5 dark:border-zinc-800/80">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">
              {activeTrade.name} <span className="text-sm font-bold text-zinc-400">({activeTrade.ticker})</span>
            </h3>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-xs font-black tracking-wider text-white shadow-sm ${
                isNote ? 'bg-amber-600 dark:bg-amber-500' : isBuy ? 'bg-buy' : 'bg-sell'
              }`}
            >
              {isNote ? '📝 NOTE 메모' : isBuy ? 'BUY 매수' : 'SELL 매도'}
            </span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {dateFormatted} {timeFormatted}
            </span>
          </div>
        </div>

        {!isNote && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-zinc-50/80 p-3.5 border border-zinc-100 dark:border-zinc-800/50 dark:bg-zinc-800/50">
                <p className="text-[0.7rem] font-semibold text-zinc-400 dark:text-zinc-500">체결단가</p>
                <p className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-100 font-mono">
                  {activeTrade.price.toLocaleString()} <span className="text-xs font-normal text-zinc-500">{currencySymbol}</span>
                </p>
              </div>
              <div className="rounded-2xl bg-zinc-50/80 p-3.5 border border-zinc-100 dark:border-zinc-800/50 dark:bg-zinc-800/50">
                <p className="text-[0.7rem] font-semibold text-zinc-400 dark:text-zinc-500">체결수량</p>
                <p className="mt-1 text-base font-black text-zinc-900 dark:text-zinc-100 font-mono">
                  {formattedQuantity} <span className="text-xs font-normal text-zinc-500">주</span>
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-xl bg-zinc-100/80 px-4 py-3 dark:bg-zinc-800/40">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">총 거래금액</span>
              <span className="text-base font-black text-zinc-900 dark:text-zinc-100 font-mono">
                {totalAmount.toLocaleString()} <span className="text-xs font-normal">{currencySymbol}</span>
              </span>
            </div>
          </>
        )}

        {/* Rationale Tags */}
        <div className="mb-4">
          <p className="mb-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">
            {isNote ? '태그' : '매수/매도 이유 태그'}
          </p>
          {tagNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tagNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                >
                  #{name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs italic text-zinc-400 dark:text-zinc-500">이 매매, 기억나는 이유가 있나요?</p>
          )}
        </div>

        {/* Memo Container */}
        <div className="mb-4 min-h-[90px] rounded-2xl border border-zinc-200/80 bg-zinc-50/60 p-3.5 dark:border-zinc-800/80 dark:bg-zinc-800/30">
          <p className="mb-1 text-[0.7rem] font-bold text-zinc-400 dark:text-zinc-500">메모</p>
          {activeTrade.memo ? (
            <p className="text-xs leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
              {activeTrade.memo}
            </p>
          ) : (
            <p className="text-xs italic text-zinc-400 dark:text-zinc-500">작성된 메모가 없습니다.</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(activeTrade)}
            className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-xs font-bold text-zinc-800 shadow-sm transition hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            수정
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(activeTrade)}
            className="flex-1 rounded-xl border border-rose-200 bg-rose-50 py-3 text-xs font-bold text-rose-600 shadow-sm transition hover:bg-rose-100 active:scale-[0.98] dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/60"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
