import { useEffect, useState, useRef } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Currency, QuantityType, Side, Tag, Trade } from '../types';
import { createTrade, updateTrade } from '../db/trades';
import { TagPicker } from './TagPicker';
import { fetchQuote, fetchFxRate } from '../api/quotes';

interface AddTradeSheetProps {
  db: IDBPDatabase<TradeReviewDB>;
  ticker: string;
  name: string;
  availableTags: Tag[];
  tradeToEdit?: Trade | null;
  onSaved: (trade: Trade) => void;
  onClose: () => void;
}

export function AddTradeSheet({
  db,
  ticker,
  name,
  availableTags,
  tradeToEdit,
  onSaved,
  onClose,
}: AddTradeSheetProps) {
  const [currency, setCurrency] = useState<Currency>(() => tradeToEdit?.currency ?? 'USD');
  const [side, setSide] = useState<Side>(() => tradeToEdit?.side ?? 'buy');
  const [price, setPrice] = useState(() => (tradeToEdit ? String(tradeToEdit.price) : ''));
  const [quantityType, setQuantityType] = useState<QuantityType>(() => tradeToEdit?.quantityType ?? 'shares');
  const [quantityValue, setQuantityValue] = useState(() => (tradeToEdit ? String(tradeToEdit.quantityValue) : ''));
  const [fxRateAtTrade, setFxRateAtTrade] = useState<number | null>(() => tradeToEdit?.fxRateAtTrade ?? null);
  const [fxRateLoading, setFxRateLoading] = useState(false);
  const [fxRateFailed, setFxRateFailed] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>(() => tradeToEdit?.rationaleTagIds ?? []);
  const [memo, setMemo] = useState(() => tradeToEdit?.memo ?? '');
  const [datetimeValue, setDatetimeValue] = useState(() =>
    tradeToEdit?.datetime
      ? tradeToEdit.datetime.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [timeValue, setTimeValue] = useState(() =>
    tradeToEdit?.datetime && tradeToEdit.datetime.includes('T')
      ? tradeToEdit.datetime.split('T')[1].slice(0, 5)
      : ''
  );

  const [translateY, setTranslateY] = useState(0);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    if (tradeToEdit) return;
    fetchQuote(ticker).then((quote) => {
      if (quote?.price != null) setPrice(String(quote.price));
      if (quote?.currency) setCurrency(quote.currency);
    });
  }, [ticker, tradeToEdit]);

  useEffect(() => {
    if (quantityType !== 'amount_krw' || currency === 'KRW' || !datetimeValue || side === 'note') {
      setFxRateAtTrade(null);
      setFxRateFailed(false);
      setFxRateLoading(false);
      return;
    }
    if (tradeToEdit && tradeToEdit.fxRateAtTrade != null) return;
    let cancelled = false;
    setFxRateLoading(true);
    setFxRateFailed(false);
    fetchFxRate(datetimeValue).then((rate) => {
      if (cancelled) return;
      setFxRateLoading(false);
      if (rate == null) {
        setFxRateFailed(true);
        setFxRateAtTrade(null);
      } else {
        setFxRateAtTrade(rate);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [quantityType, currency, datetimeValue, tradeToEdit, side]);

  function retryFxRate() {
    if (!datetimeValue) return;
    setFxRateFailed(false);
    setFxRateLoading(true);
    fetchFxRate(datetimeValue).then((rate) => {
      setFxRateLoading(false);
      if (rate == null) {
        setFxRateFailed(true);
      } else {
        setFxRateAtTrade(rate);
      }
    });
  }

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

  async function handleSave() {
    const isNote = side === 'note';
    const tradeData = {
      ticker,
      market: (currency === 'KRW' ? 'KR' : 'US') as 'KR' | 'US',
      name,
      currency,
      datetime: new Date(timeValue ? `${datetimeValue}T${timeValue}` : datetimeValue).toISOString(),
      datetimeUnknown: false,
      side,
      price: isNote ? 0 : Number(price),
      quantityType: isNote ? ('shares' as QuantityType) : quantityType,
      quantityValue: isNote ? 0 : Number(quantityValue),
      fxRateAtTrade: quantityType === 'amount_krw' && currency !== 'KRW' ? fxRateAtTrade : null,
      rationaleTagIds: tagIds,
      conviction: null,
      memo,
      attachment: null,
    };

    let trade: Trade;
    if (tradeToEdit) {
      trade = await updateTrade(db, tradeToEdit.id, tradeData);
    } else {
      trade = await createTrade(db, tradeData);
    }
    onSaved(trade);
  }

  const isNote = side === 'note';

  return (
    <div
      role="dialog"
      aria-label="매매 기록 추가"
      style={{
        transform: `translateY(${translateY}px)`,
        transition: translateY === 0 ? 'transform 0.2s ease-out' : 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative flex flex-col justify-between w-full h-[520px] max-h-[85vh] rounded-t-3xl border border-zinc-200/80 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="flex flex-col justify-between h-full"
      >
        <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-3">
          {/* Top Drag Handle & Close Button */}
          <div className="relative mb-1 flex items-center justify-between pt-1">
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

          <p className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            {name} <span className="text-sm font-bold text-zinc-400">({ticker})</span>
          </p>

          <div role="radiogroup" aria-label="매수/매도/메모" className="flex gap-2">
            <button
              type="button"
              aria-pressed={side === 'buy'}
              onClick={() => setSide('buy')}
              className={
                side === 'buy'
                  ? 'flex-1 rounded-xl bg-buy py-2.5 text-sm font-bold text-white shadow-sm'
                  : 'flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
              }
            >
              매수
            </button>
            <button
              type="button"
              aria-pressed={side === 'sell'}
              onClick={() => setSide('sell')}
              className={
                side === 'sell'
                  ? 'flex-1 rounded-xl bg-sell py-2.5 text-sm font-bold text-white shadow-sm'
                  : 'flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
              }
            >
              매도
            </button>
            <button
              type="button"
              aria-pressed={side === 'note'}
              onClick={() => setSide('note')}
              className={
                side === 'note'
                  ? 'flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white shadow-sm dark:bg-amber-500'
                  : 'flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
              }
            >
              📝 메모
            </button>
          </div>

          {!isNote && (
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {currency === 'KRW' ? '체결가 (원)' : '체결가 ($)'}
              <input
                aria-label={currency === 'KRW' ? '체결가 (원)' : '체결가 ($)'}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-bold font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </label>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {isNote ? '기록 날짜' : '체결 날짜'}
              <input
                aria-label={isNote ? '기록 날짜' : '체결 날짜'}
                type="date"
                value={datetimeValue}
                onChange={(e) => setDatetimeValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </label>

            <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {isNote ? '기록 시각 (선택)' : '체결 시각 (선택)'}
              <input
                aria-label={isNote ? '기록 시각' : '체결 시각'}
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-bold text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </label>
          </div>

          {!isNote && (
            <>
              <div role="radiogroup" aria-label="수량 단위" className="flex gap-2">
                <button
                  type="button"
                  aria-pressed={quantityType === 'shares'}
                  onClick={() => setQuantityType('shares')}
                  className={
                    quantityType === 'shares'
                      ? 'flex-1 rounded-xl bg-zinc-900 py-2 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                      : 'flex-1 rounded-xl border border-zinc-200 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                  }
                >
                  수량(주)
                </button>
                <button
                  type="button"
                  aria-pressed={quantityType === 'amount'}
                  onClick={() => setQuantityType('amount')}
                  className={
                    quantityType === 'amount'
                      ? 'flex-1 rounded-xl bg-zinc-900 py-2 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                      : 'flex-1 rounded-xl border border-zinc-200 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                  }
                >
                  {currency === 'KRW' ? '금액(원)' : '금액($)'}
                </button>
                {currency === 'USD' && (
                  <button
                    type="button"
                    aria-pressed={quantityType === 'amount_krw'}
                    onClick={() => setQuantityType('amount_krw')}
                    className={
                      quantityType === 'amount_krw'
                        ? 'flex-1 rounded-xl bg-zinc-900 py-2 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                        : 'flex-1 rounded-xl border border-zinc-200 py-2 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
                    }
                  >
                    금액(원)
                  </button>
                )}
              </div>

              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {quantityType === 'shares'
                  ? '수량(주)'
                  : quantityType === 'amount_krw' || currency === 'KRW'
                  ? '금액(원)'
                  : '금액($)'}
                <input
                  aria-label="수량 또는 금액"
                  value={quantityValue}
                  onChange={(e) => setQuantityValue(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-bold font-mono text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                />
              </label>

              {quantityType === 'amount_krw' && currency === 'USD' && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {fxRateLoading && <p>환율 조회 중...</p>}
                  {fxRateFailed && (
                    <div className="flex items-center gap-2">
                      <p className="text-loss">환율 조회 실패</p>
                      <button
                        type="button"
                        onClick={retryFxRate}
                        className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-700"
                      >
                        다시 시도
                      </button>
                    </div>
                  )}
                  {fxRateAtTrade != null && !fxRateLoading && <p>체결 시점 환율: {fxRateAtTrade}</p>}
                </div>
              )}
            </>
          )}

          <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            {isNote ? '태그' : '매수/매도 이유'}
          </p>
          <TagPicker tags={availableTags} selectedIds={tagIds} onChange={setTagIds} />

          <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            메모
            <textarea
              aria-label="메모"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </label>
        </div>

        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
          <button
            type="submit"
            disabled={
              !datetimeValue ||
              (!isNote && (!price.trim() || !quantityValue.trim())) ||
              tagIds.length === 0 ||
              (quantityType === 'amount_krw' && currency === 'USD' && fxRateAtTrade == null)
            }
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40 shadow-sm"
          >
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
