import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Tag, Trade } from '../types';
import { listTradesByTicker } from '../db/trades';
import { getPosition } from '../db/positions';
import { fetchHistory, type HistoryBar } from '../api/quotes';
import { PriceChart } from './PriceChart';
import { TradeList } from './TradeList';
import { TradeBottomSheet } from './TradeBottomSheet';
import { AddTradeSheet } from './AddTradeSheet';
import { TickerSearch } from './TickerSearch';
import { adjacentTicker, sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

interface ChartScreenProps {
  db: IDBPDatabase<TradeReviewDB>;
  ticker: string;
  name: string;
  tags: Tag[];
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSelectTicker: (ticker: string, name: string) => void;
  onTradeSaved: () => void;
}

export function ChartScreen({
  db,
  ticker,
  name,
  tags,
  positions,
  sortOrder,
  onSelectTicker,
  onTradeSaved,
}: ChartScreenProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [avgCost, setAvgCost] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryBar[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showListSheet, setShowListSheet] = useState(false);

  async function reload() {
    const [ticketTrades, position] = await Promise.all([listTradesByTicker(db, ticker), getPosition(db, ticker)]);
    setTrades(ticketTrades);
    setAvgCost(position.totalQuantity !== 0 ? position.avgCost : null);
  }

  useEffect(() => {
    setShowAddSheet(false);
    setShowListSheet(false);
    setSelected(null);
    reload();
    fetchHistory(ticker).then(setHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ticker]);

  const sortedTickers = sortPositionItems(positions, sortOrder).map((p) => p.ticker);
  const prevTicker = adjacentTicker(sortedTickers, ticker, 'prev');
  const nextTicker = adjacentTicker(sortedTickers, ticker, 'next');
  const prevName = positions.find((p) => p.ticker === prevTicker)?.name ?? '';
  const nextName = positions.find((p) => p.ticker === nextTicker)?.name ?? '';

  async function handleTradeSaved() {
    await reload();
    setShowAddSheet(false);
    onTradeSaved();
  }

  return (
    <div>
      <div>
        <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
      </div>

      <div>
        <button
          type="button"
          aria-label="이전 종목"
          disabled={!prevTicker}
          onClick={() => prevTicker && onSelectTicker(prevTicker, prevName)}
        >
          ‹
        </button>
        <h2>
          {ticker} <span>{name}</span>
        </h2>
        <button
          type="button"
          aria-label="다음 종목"
          disabled={!nextTicker}
          onClick={() => nextTicker && onSelectTicker(nextTicker, nextName)}
        >
          ›
        </button>
      </div>

      <PriceChart history={history} trades={trades} avgCost={avgCost} onPointSelect={setSelected} />

      <div>
        <button type="button" onClick={() => setShowAddSheet(true)}>
          + 매매 기록 추가
        </button>
        <button type="button" onClick={() => setShowListSheet(true)}>
          매매 목록
        </button>
      </div>

      {showAddSheet && (
        <AddTradeSheet
          db={db}
          ticker={ticker}
          name={name}
          availableTags={tags}
          onSaved={handleTradeSaved}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {showListSheet && (
        <div role="dialog" aria-label="매매 목록 시트">
          <button type="button" onClick={() => setShowListSheet(false)}>
            닫기
          </button>
          <TradeList trades={trades} tags={tags} onSelect={setSelected} />
        </div>
      )}

      {selected && <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />}
    </div>
  );
}
