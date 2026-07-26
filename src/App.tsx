import { useEffect, useMemo, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './db/schema';
import { listActiveTags, seedDefaultTags } from './db/tags';
import { listPositions } from './db/positions';
import { requestPersistentStorage } from './lib/persistStorage';
import { fetchQuote } from './api/quotes';
import { HomeScreen } from './components/HomeScreen';
import { ChartScreen } from './components/ChartScreen';
import { TagManagementScreen } from './components/TagManagementScreen';
import type { Position, Tag } from './types';
import { type PositionListItem, type SortOrder } from './lib/positionNav';

export function App() {
  const [db, setDb] = useState<IDBPDatabase<TradeReviewDB> | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [quotes, setQuotes] = useState<Record<string, { price: number | null; dailyChangePercent?: number | null }>>({});
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [screen, setScreen] = useState<'home' | 'chart' | 'tags'>('home');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [activeName, setActiveName] = useState('');

  async function reloadPositions(database: IDBPDatabase<TradeReviewDB>) {
    const pos = await listPositions(database);
    setPositions(pos);
    const entries = await Promise.all(
      pos.map(async (p): Promise<[string, { price: number | null; dailyChangePercent?: number | null }]> => {
        const q = await fetchQuote(p.ticker);
        return [p.ticker, { price: q?.price ?? null, dailyChangePercent: q?.dailyChangePercent ?? null }];
      })
    );
    setQuotes(Object.fromEntries(entries));
  }

  useEffect(() => {
    requestPersistentStorage();
    openTradeReviewDB().then(async (opened) => {
      setDb(opened);
      await seedDefaultTags(opened);
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

  useEffect(() => {
    window.history.replaceState({ screen: 'home' }, '');
    function handlePopState(event: PopStateEvent) {
      const state = event.state as
        | { screen: 'home' }
        | { screen: 'chart'; ticker: string; name: string }
        | { screen: 'tags' }
        | null;
      if (!state || state.screen === 'home') {
        setScreen('home');
        return;
      }
      if (state.screen === 'tags') {
        setScreen('tags');
        return;
      }
      setActiveTicker(state.ticker);
      setActiveName(state.name);
      setScreen('chart');
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const positionItems: PositionListItem[] = useMemo(
    () =>
      positions
        .filter((p) => p.totalQuantity !== 0)
        .map((p) => ({
          ticker: p.ticker,
          name: p.name,
          avgCost: p.avgCost,
          totalQuantity: p.totalQuantity,
          lastTradeAt: p.avgCostHistory[p.avgCostHistory.length - 1]?.at ?? '',
          lastTradeRecordedAt: p.lastTradeRecordedAt,
          currentPrice: quotes[p.ticker]?.price ?? null,
          dailyChangePercent: quotes[p.ticker]?.dailyChangePercent ?? null,
          buyCnt: p.buyCnt,
          sellCnt: p.sellCnt,
          noteCnt: p.noteCnt,
        })),
    [positions, quotes]
  );

  function handleSelectTicker(ticker: string, name: string) {
    if (screen === 'home') {
      window.history.pushState({ screen: 'chart', ticker, name }, '');
    } else {
      window.history.replaceState({ screen: 'chart', ticker, name }, '');
    }
    setActiveTicker(ticker);
    setActiveName(name);
    setScreen('chart');
  }

  async function handleTradeSaved() {
    if (db) await reloadPositions(db);
  }

  function handleOpenTagManagement() {
    window.history.pushState({ screen: 'tags' }, '');
    setScreen('tags');
  }

  async function handleCloseTagManagement() {
    if (db) setTags(await listActiveTags(db));
    window.history.back();
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
          onOpenTagManagement={handleOpenTagManagement}
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
      {screen === 'tags' && (
        <TagManagementScreen db={db} onBack={handleCloseTagManagement} />
      )}
    </main>
  );
}
