import { useEffect, useRef, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Tag, Trade } from '../types';
import { deleteTrade, listTradesByTicker } from '../db/trades';
import { getPosition } from '../db/positions';
import { fetchHistory, fetchQuote, type HistoryBar, type QuoteResult } from '../api/quotes';
import { PriceChart } from './PriceChart';
import { TradeList } from './TradeList';
import { TradeBottomSheet } from './TradeBottomSheet';
import { AddTradeSheet } from './AddTradeSheet';
import { TickerSearch } from './TickerSearch';
import { adjacentTicker, dailyChangeAmount, sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

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
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const activeTickerRef = useRef(ticker);
  const modalPushedRef = useRef(false);

  function closeModal(skipHistoryBack = false) {
    if (modalPushedRef.current) {
      modalPushedRef.current = false;
      if (!skipHistoryBack) {
        window.history.back();
      }
    }
    setShowAddSheet(false);
    setTradeToEdit(null);
    setSelected(null);
  }

  function openAddSheet(trade: Trade | null = null) {
    setTradeToEdit(trade);
    setShowAddSheet(true);
    if (!modalPushedRef.current) {
      modalPushedRef.current = true;
      window.history.pushState({ screen: 'chart', ticker, name, modalOpen: true }, '');
    }
  }

  function openDetailSheet(trade: Trade) {
    setSelected(trade);
    if (!modalPushedRef.current) {
      modalPushedRef.current = true;
      window.history.pushState({ screen: 'chart', ticker, name, modalOpen: true }, '');
    }
  }

  useEffect(() => {
    function handlePopState() {
      if (modalPushedRef.current) {
        modalPushedRef.current = false;
        setShowAddSheet(false);
        setTradeToEdit(null);
        setSelected(null);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
    if (modalPushedRef.current) {
      modalPushedRef.current = false;
    }
    setShowAddSheet(false);
    setTradeToEdit(null);
    setSelected(null);
    setQuote(null);
    reload();
    fetchHistory(ticker).then((bars) => {
      if (activeTickerRef.current === ticker) setHistory(bars);
    });
    fetchQuote(ticker).then((q) => {
      if (activeTickerRef.current === ticker) setQuote(q);
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
    closeModal();
    onTradeSaved();
  }

  function handleEditTrade(trade: Trade) {
    setSelected(null);
    setTradeToEdit(trade);
    setShowAddSheet(true);
  }

  async function handleDeleteTrade(trade: Trade) {
    await deleteTrade(db, trade.id);
    await reload();
    closeModal();
    onTradeSaved();
  }

  const dailyPercent = quote?.dailyChangePercent ?? null;
  const dailyAmount = quote?.price != null && dailyPercent != null ? dailyChangeAmount(quote.price, dailyPercent) : null;
  const isDailyLoss = dailyPercent != null && dailyPercent < 0;
  const isDailyProfit = dailyPercent != null && dailyPercent > 0;
  const dailyColor = isDailyLoss
    ? 'text-blue-600 dark:text-blue-400'
    : isDailyProfit
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-zinc-500 dark:text-zinc-400';

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
          <span className="block text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">{name || ticker}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">{ticker}</span>
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

      {quote?.price != null && (
        <div data-testid="chart-quote" className="flex flex-col items-center gap-0.5">
          <div className="font-mono text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            {quote.price.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-zinc-400 dark:text-zinc-500">
              {quote.currency === 'USD' ? 'USD' : '원'}
            </span>
          </div>
          {dailyAmount != null && dailyPercent != null ? (
            <div className={`flex items-center gap-1 font-mono text-sm font-bold ${dailyColor}`}>
              {isDailyLoss && <span aria-hidden>▼</span>}
              {isDailyProfit && <span aria-hidden>▲</span>}
              <span>{Math.abs(dailyAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              <span>
                ({dailyPercent > 0 ? '+' : ''}
                {dailyPercent.toFixed(2)}%)
              </span>
            </div>
          ) : (
            <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">전일대비 -</span>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
        <PriceChart history={history} trades={trades} avgCost={avgCost} onPointSelect={openDetailSheet} />
      </div>

      <button
        type="button"
        onClick={() => openAddSheet(null)}
        className="rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98]"
      >
        + 기록 추가
      </button>

      <TradeList trades={trades} tags={tags} onSelect={openDetailSheet} />

      {showAddSheet && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-zinc-900/50 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
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
            onClose={() => closeModal()}
          />
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-20 flex items-end bg-zinc-900/50 backdrop-blur-[2px]"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <TradeBottomSheet
            trade={selected}
            tags={tags}
            tradesOnSameDate={tradesOnSameDate}
            onClose={() => closeModal()}
            onEdit={handleEditTrade}
            onDelete={handleDeleteTrade}
          />
        </div>
      )}
    </div>
  );
}
