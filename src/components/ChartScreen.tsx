import { useEffect, useRef, useState } from 'react';
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
  const activeTickerRef = useRef(ticker);

  async function reload() {
    const requestedTicker = ticker;
    const [ticketTrades, position] = await Promise.all([
      listTradesByTicker(db, requestedTicker),
      getPosition(db, requestedTicker),
    ]);
    if (activeTickerRef.current !== requestedTicker) return;
    setTrades(ticketTrades);
    setAvgCost(position.totalQuantity !== 0 ? position.avgCost : null);
  }

  useEffect(() => {
    activeTickerRef.current = ticker;
    setShowAddSheet(false);
    setShowListSheet(false);
    setSelected(null);
    reload();
    fetchHistory(ticker).then((bars) => {
      if (activeTickerRef.current === ticker) setHistory(bars);
    });
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
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4 pb-24">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="홈"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          ⌂
        </button>
        <div className="flex-1">
          <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 종목"
          disabled={!prevTicker}
          onClick={() => prevTicker && onSelectTicker(prevTicker, prevName)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-400"
        >
          ‹
        </button>
        <h2 className="text-center">
          <span className="block text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">{ticker}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">{name}</span>
        </h2>
        <button
          type="button"
          aria-label="다음 종목"
          disabled={!nextTicker}
          onClick={() => nextTicker && onSelectTicker(nextTicker, nextName)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-400"
        >
          ›
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
        <PriceChart history={history} trades={trades} avgCost={avgCost} onPointSelect={setSelected} />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowAddSheet(true)}
          className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98]"
        >
          + 매매 기록 추가
        </button>
        <button
          type="button"
          onClick={() => setShowListSheet(true)}
          className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-900 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        >
          매매 목록
        </button>
      </div>

      {showAddSheet && (
        <div className="fixed inset-0 z-20 flex items-end bg-zinc-900/40">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-zinc-900">
            <AddTradeSheet
              db={db}
              ticker={ticker}
              name={name}
              availableTags={tags}
              onSaved={handleTradeSaved}
              onClose={() => setShowAddSheet(false)}
            />
          </div>
        </div>
      )}

      {showListSheet && (
        <div className="fixed inset-0 z-20 flex items-end bg-zinc-900/40">
          <div
            role="dialog"
            aria-label="매매 목록 시트"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-zinc-900"
          >
            <button
              type="button"
              onClick={() => setShowListSheet(false)}
              className="mb-2 rounded-xl px-3 py-1 text-sm text-zinc-500 dark:text-zinc-400"
            >
              닫기
            </button>
            <TradeList trades={trades} tags={tags} onSelect={setSelected} />
          </div>
        </div>
      )}

      {selected && <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />}
    </div>
  );
}
