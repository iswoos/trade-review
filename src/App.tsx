import { useEffect, useMemo, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './db/schema';
import { listActiveTags } from './db/tags';
import { listPositions } from './db/positions';
import { requestPersistentStorage } from './lib/persistStorage';
import { fetchQuote } from './api/quotes';
import { HomeScreen } from './components/HomeScreen';
import { ChartScreen } from './components/ChartScreen';
import type { Position, Tag } from './types';
import { type PositionListItem, type SortOrder } from './lib/positionNav';

export function App() {
  const [db, setDb] = useState<IDBPDatabase<TradeReviewDB> | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [screen, setScreen] = useState<'home' | 'chart'>('home');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [activeName, setActiveName] = useState('');

  async function reloadPositions(database: IDBPDatabase<TradeReviewDB>) {
    const pos = await listPositions(database);
    setPositions(pos);
    const entries = await Promise.all(
      pos.map(async (p): Promise<[string, number | null]> => [p.ticker, (await fetchQuote(p.ticker))?.price ?? null])
    );
    setPrices(Object.fromEntries(entries));
  }

  useEffect(() => {
    requestPersistentStorage();
    openTradeReviewDB().then(async (opened) => {
      setDb(opened);
      setTags(await listActiveTags(opened));
      await reloadPositions(opened);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the IndexedDB connection on unmount so it doesn't linger and block a later
  // indexedDB.deleteDatabase()/openDB() call from a subsequent test (or page navigation).
  useEffect(() => {
    return () => db?.close();
  }, [db]);

  const positionItems: PositionListItem[] = useMemo(
    () =>
      positions
        .filter((p) => p.totalQuantity !== 0)
        .map((p) => ({
          ticker: p.ticker,
          name: p.name,
          avgCost: p.avgCost,
          lastTradeAt: p.avgCostHistory[p.avgCostHistory.length - 1]?.at ?? '',
          currentPrice: prices[p.ticker] ?? null,
        })),
    [positions, prices]
  );

  function handleSelectTicker(ticker: string, name: string) {
    setActiveTicker(ticker);
    setActiveName(name);
    setScreen('chart');
  }

  async function handleTradeSaved() {
    if (db) await reloadPositions(db);
  }

  if (!db) return <p>불러오는 중...</p>;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {screen === 'home' && (
        <HomeScreen
          positions={positionItems}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onSelectTicker={handleSelectTicker}
        />
      )}
      {screen === 'chart' && activeTicker && (
        <ChartScreen
          db={db}
          ticker={activeTicker}
          name={activeName}
          tags={tags}
          positions={positionItems}
          sortOrder={sortOrder}
          onSelectTicker={handleSelectTicker}
          onTradeSaved={handleTradeSaved}
        />
      )}
    </main>
  );
}
