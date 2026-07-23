import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Position, Tag, Trade } from '../types';
import { listTradesByTicker } from '../db/trades';
import { getPosition } from '../db/positions';
import { fetchHistory, type HistoryBar } from '../api/quotes';
import { PriceChart } from './PriceChart';
import { TradeList } from './TradeList';
import { TradeBottomSheet } from './TradeBottomSheet';

interface StockDetailProps {
  db: IDBPDatabase<TradeReviewDB>;
  ticker: string;
  tags: Tag[];
}

export function StockDetail({ db, ticker, tags }: StockDetailProps) {
  const [tab, setTab] = useState<'chart' | 'list'>('chart');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [history, setHistory] = useState<HistoryBar[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);

  useEffect(() => {
    listTradesByTicker(db, ticker).then(setTrades);
    getPosition(db, ticker).then(setPosition);
    fetchHistory(ticker).then(setHistory);
  }, [db, ticker]);

  return (
    <div>
      <div role="tablist" aria-label="종목 상세 탭">
        <button type="button" role="tab" aria-selected={tab === 'chart'} onClick={() => setTab('chart')}>
          차트
        </button>
        <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}>
          목록
        </button>
      </div>
      {tab === 'chart' && position && (
        <PriceChart history={history} trades={trades} avgCost={position.avgCost} onPointSelect={setSelected} />
      )}
      {tab === 'list' && <TradeList trades={trades} tags={tags} onSelect={setSelected} />}
      {selected && <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />}
    </div>
  );
}
