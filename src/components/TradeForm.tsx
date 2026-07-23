import { useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Currency, QuantityType, Side, Tag, Trade } from '../types';
import { createTrade } from '../db/trades';
import { SymbolSearch } from './SymbolSearch';
import { TagPicker } from './TagPicker';
import { ConvictionStars } from './ConvictionStars';
import { fetchQuote, type SymbolResult } from '../api/quotes';

interface TradeFormProps {
  db: IDBPDatabase<TradeReviewDB>;
  availableTags: Tag[];
  onSaved: (trade: Trade) => void;
}

export function TradeForm({ db, availableTags, onSaved }: TradeFormProps) {
  const [symbol, setSymbol] = useState<SymbolResult | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [side, setSide] = useState<Side>('buy');
  const [price, setPrice] = useState('');
  const [quantityType, setQuantityType] = useState<QuantityType>('shares');
  const [quantityValue, setQuantityValue] = useState('');
  const [fxRateAtTrade, setFxRateAtTrade] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [conviction, setConviction] = useState<number | null>(null);
  const [memo, setMemo] = useState('');

  async function handleSelectSymbol(result: SymbolResult) {
    setSymbol(result);
    const quote = await fetchQuote(result.symbol);
    if (quote?.price != null) {
      setPrice(String(quote.price));
    }
    if (quote?.currency) {
      setCurrency(quote.currency);
    }
  }

  async function handleSave() {
    if (!symbol) return;
    const trade = await createTrade(db, {
      ticker: symbol.symbol,
      market: currency === 'KRW' ? 'KR' : 'US',
      name: symbol.name,
      currency,
      datetime: new Date().toISOString(),
      datetimeUnknown: false,
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      {!symbol && <SymbolSearch onSelect={handleSelectSymbol} />}
      {symbol && (
        <>
          <p>
            {symbol.name} ({symbol.symbol})
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
            <input
              aria-label="체결가"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <div role="radiogroup" aria-label="수량 단위">
            <button
              type="button"
              aria-pressed={quantityType === 'shares'}
              onClick={() => setQuantityType('shares')}
            >
              주
            </button>
            <button
              type="button"
              aria-pressed={quantityType === 'amount'}
              onClick={() => setQuantityType('amount')}
            >
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
        </>
      )}
    </form>
  );
}
