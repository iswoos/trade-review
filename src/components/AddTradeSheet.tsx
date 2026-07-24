import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Currency, QuantityType, Side, Tag, Trade } from '../types';
import { createTrade } from '../db/trades';
import { TagPicker } from './TagPicker';
import { ConvictionStars } from './ConvictionStars';
import { fetchQuote } from '../api/quotes';

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
  const [fxRateAtTrade, setFxRateAtTrade] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [conviction, setConviction] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [datetimeValue, setDatetimeValue] = useState(() => new Date().toISOString().slice(0, 10));
  const [datetimeUnknown, setDatetimeUnknown] = useState(false);

  useEffect(() => {
    fetchQuote(ticker).then((quote) => {
      if (quote?.price != null) setPrice(String(quote.price));
      if (quote?.currency) setCurrency(quote.currency);
    });
  }, [ticker]);

  async function handleSave() {
    const trade = await createTrade(db, {
      ticker,
      market: currency === 'KRW' ? 'KR' : 'US',
      name,
      currency,
      datetime: datetimeUnknown ? null : new Date(datetimeValue).toISOString(),
      datetimeUnknown,
      side,
      price: Number(price),
      quantityType,
      quantityValue: Number(quantityValue),
      fxRateAtTrade: quantityType === 'amount' && currency !== 'KRW' ? Number(fxRateAtTrade) : null,
      rationaleTagIds: tagIds,
      conviction,
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
      >
        <p>
          {name} ({ticker})
        </p>
        <div role="radiogroup" aria-label="매수/매도">
          <button type="button" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
            매수
          </button>
          <button type="button" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
            매도
          </button>
        </div>
        <label>
          체결가
          <input aria-label="체결가" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          체결 날짜
          <input
            aria-label="체결 날짜"
            type="date"
            value={datetimeValue}
            onChange={(e) => setDatetimeValue(e.target.value)}
            disabled={datetimeUnknown}
          />
        </label>
        <button type="button" aria-pressed={datetimeUnknown} onClick={() => setDatetimeUnknown((prev) => !prev)}>
          시간 모름 / 예약매매
        </button>
        <div role="radiogroup" aria-label="수량 단위">
          <button type="button" aria-pressed={quantityType === 'shares'} onClick={() => setQuantityType('shares')}>
            주
          </button>
          <button type="button" aria-pressed={quantityType === 'amount'} onClick={() => setQuantityType('amount')}>
            원
          </button>
        </div>
        <label>
          {quantityType === 'shares' ? '수량' : '금액(원)'}
          <input
            aria-label="수량 또는 금액"
            value={quantityValue}
            onChange={(e) => setQuantityValue(e.target.value)}
            inputMode="decimal"
          />
        </label>
        {quantityType === 'amount' && currency !== 'KRW' && (
          <label>
            체결 시점 환율
            <input
              aria-label="체결 시점 환율"
              value={fxRateAtTrade}
              onChange={(e) => setFxRateAtTrade(e.target.value)}
              inputMode="decimal"
            />
          </label>
        )}
        <TagPicker tags={availableTags} selectedIds={tagIds} onChange={setTagIds} />
        <ConvictionStars value={conviction} onChange={setConviction} />
        <label>
          메모
          <textarea aria-label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <button type="submit">저장 · 평단 자동계산</button>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </form>
    </div>
  );
}
