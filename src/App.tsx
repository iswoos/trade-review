import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './db/schema';
import { listActiveTags } from './db/tags';
import { requestPersistentStorage } from './lib/persistStorage';
import { TradeForm } from './components/TradeForm';
import { StockDetail } from './components/StockDetail';
import type { Tag, Trade } from './types';

export function App() {
  const [db, setDb] = useState<IDBPDatabase<TradeReviewDB> | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [screen, setScreen] = useState<'form' | 'detail'>('form');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  useEffect(() => {
    requestPersistentStorage();
    openTradeReviewDB().then(async (opened) => {
      setDb(opened);
      setTags(await listActiveTags(opened));
    });
  }, []);

  function handleSaved(trade: Trade) {
    setActiveTicker(trade.ticker);
    setScreen('detail');
  }

  if (!db) return <p>불러오는 중...</p>;

  return (
    <main>
      {screen === 'form' && <TradeForm db={db} availableTags={tags} onSaved={handleSaved} />}
      {screen === 'detail' && activeTicker && (
        <>
          <button type="button" onClick={() => setScreen('form')}>
            + 매매 기록 추가
          </button>
          <StockDetail db={db} ticker={activeTicker} tags={tags} />
        </>
      )}
    </main>
  );
}
