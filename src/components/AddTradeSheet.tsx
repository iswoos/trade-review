import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Currency, QuantityType, Side, Tag, Trade } from '../types';
import { createTrade } from '../db/trades';
import { TagPicker } from './TagPicker';
import { fetchQuote, fetchFxRate } from '../api/quotes';

interface AddTradeSheetProps {
  db: IDBPDatabase<TradeReviewDB>;
  ticker: string;
  name: string;
  availableTags: Tag[];
  onSaved: (trade: Trade) => void;
  onClose: () => void;
}

export function AddTradeSheet({ db, ticker, name, availableTags, onSaved, onClose }: AddTradeSheetProps) {
  const [currency, setCurrency] = useState<Currency>('USD');
  const [side, setSide] = useState<Side>('buy');
  const [price, setPrice] = useState('');
  const [quantityType, setQuantityType] = useState<QuantityType>('shares');
  const [quantityValue, setQuantityValue] = useState('');
  const [fxRateAtTrade, setFxRateAtTrade] = useState<number | null>(null);
  const [fxRateLoading, setFxRateLoading] = useState(false);
  const [fxRateFailed, setFxRateFailed] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
  const [datetimeValue, setDatetimeValue] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeValue, setTimeValue] = useState('');

  useEffect(() => {
    fetchQuote(ticker).then((quote) => {
      if (quote?.price != null) setPrice(String(quote.price));
      if (quote?.currency) setCurrency(quote.currency);
    });
  }, [ticker]);

  useEffect(() => {
    if (quantityType !== 'amount' || currency === 'KRW' || !datetimeValue) {
      setFxRateAtTrade(null);
      setFxRateFailed(false);
      setFxRateLoading(false);
      return;
    }
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
  }, [quantityType, currency, datetimeValue]);

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

  async function handleSave() {
    const trade = await createTrade(db, {
      ticker,
      market: currency === 'KRW' ? 'KR' : 'US',
      name,
      currency,
      datetime: new Date(timeValue ? `${datetimeValue}T${timeValue}` : datetimeValue).toISOString(),
      datetimeUnknown: false,
      side,
      price: Number(price),
      quantityType,
      quantityValue: Number(quantityValue),
      fxRateAtTrade: quantityType === 'amount' && currency !== 'KRW' ? fxRateAtTrade : null,
      rationaleTagIds: tagIds,
      conviction: null,
      memo,
      attachment: null,
    });
    onSaved(trade);
  }

  return (
    <div role="dialog" aria-label="매매 기록 추가">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">
          {name} ({ticker})
        </p>
        <div role="radiogroup" aria-label="매수/매도" className="flex gap-2">
          <button
            type="button"
            aria-pressed={side === 'buy'}
            onClick={() => setSide('buy')}
            className={
              side === 'buy'
                ? 'flex-1 rounded-xl bg-buy py-2 text-sm font-bold text-white'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
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
                ? 'flex-1 rounded-xl bg-sell py-2 text-sm font-bold text-white'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            매도
          </button>
        </div>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          {currency === 'KRW' ? '체결가 (원)' : '체결가 ($)'}
          <input
            aria-label={currency === 'KRW' ? '체결가 (원)' : '체결가 ($)'}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          체결 날짜
          <input
            aria-label="체결 날짜"
            type="date"
            value={datetimeValue}
            onChange={(e) => setDatetimeValue(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          체결 시각 (선택)
          <input
            aria-label="체결 시각"
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <div role="radiogroup" aria-label="수량 단위" className="flex gap-2">
          <button
            type="button"
            aria-pressed={quantityType === 'shares'}
            onClick={() => setQuantityType('shares')}
            className={
              quantityType === 'shares'
                ? 'flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
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
                ? 'flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            {currency === 'KRW' ? '금액(원)' : '금액($)'}
          </button>
        </div>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          {quantityType === 'shares' ? '수량(주)' : currency === 'KRW' ? '금액(원)' : '금액($)'}
          <input
            aria-label="수량 또는 금액"
            value={quantityValue}
            onChange={(e) => setQuantityValue(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        {quantityType === 'amount' && currency !== 'KRW' && (
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
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">매수/매도 이유</p>
        <TagPicker tags={availableTags} selectedIds={tagIds} onChange={setTagIds} />
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          메모
          <textarea
            aria-label="메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          disabled={
            !datetimeValue ||
            !price.trim() ||
            !quantityValue.trim() ||
            tagIds.length === 0 ||
            (quantityType === 'amount' && currency !== 'KRW' && fxRateAtTrade == null)
          }
          className="rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-zinc-200 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          닫기
        </button>
      </form>
    </div>
  );
}
