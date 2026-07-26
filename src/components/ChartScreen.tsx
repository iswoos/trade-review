import { useEffect, useRef, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Tag, Trade } from '../types';
import { deleteTrade, listTradesByTicker } from '../db/trades';
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
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
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
    setTradeToEdit(null);
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
    setTradeToEdit(null);
    onTradeSaved();
  }

  function handleEditTrade(trade: Trade) {
    setSelected(null);
    setTradeToEdit(trade);
    setShowAddSheet(true);
  }

  async function handleDeleteTrade(trade: Trade) {
    setSelected(null);
    await deleteTrade(db, trade.id);
    await handleTradeSaved();
  }

  const selectedDate = selected?.datetime ? selected.datetime.slice(0, 10) : null;
  const tradesOnSameDate = selectedDate
    ? trades.filter((t) => t.datetime && t.datetime.slice(0, 10) === selectedDate)
    : [];

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

      <button
        type="button"
        onClick={() => {
          setTradeToEdit(null);
          setShowAddSheet(true);
        }}
        className="rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98]"
      >
        + 매매 기록 추가
      </button>

      <TradeList trades={trades} tags={tags} onSelect={setSelected} />

      {showAddSheet && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-zinc-900/50 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddSheet(false);
              setTradeToEdit(null);
            }
          }}
        >
          <AddTradeSheet
            db={db}
            ticker={ticker}
            name={name}
            availableTags={tags}
            tradeToEdit={tradeToEdit}
            onSaved={handleTradeSaved}
            onClose={() => {
              setShowAddSheet(false);
              setTradeToEdit(null);
            }}
          />
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-zinc-900/50 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <TradeBottomSheet
            trade={selected}
            tags={tags}
            tradesOnSameDate={tradesOnSameDate}
            onClose={() => setSelected(null)}
            onEdit={handleEditTrade}
            onDelete={handleDeleteTrade}
          />
        </div>
      )}
    </div>
  );
}
