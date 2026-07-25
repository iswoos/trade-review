import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTag, renameTag, archiveTag, listActiveTags, listAllTags, seedDefaultTags } from './tags';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  const deleteRequest = indexedDB.deleteDatabase('trade-review');
  await new Promise<void>((resolve, reject) => {
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
  db = await openTradeReviewDB();
}, 30000);

afterEach(() => {
  db.close();
});

describe('tags', () => {
  it('creates a tag with archived: false', async () => {
    const tag = await createTag(db, '감');
    expect(tag.name).toBe('감');
    expect(tag.archived).toBe(false);
  });

  it('rename updates the tag everywhere it is stored (single source of truth)', async () => {
    const tag = await createTag(db, '감');
    await renameTag(db, tag.id, '직감');
    const all = await listAllTags(db);
    expect(all.find((t) => t.id === tag.id)?.name).toBe('직감');
  });

  it('archive hides a tag from listActiveTags but keeps it in listAllTags', async () => {
    const tag = await createTag(db, '지인추천');
    await archiveTag(db, tag.id);
    const active = await listActiveTags(db);
    const all = await listAllTags(db);
    expect(active.find((t) => t.id === tag.id)).toBeUndefined();
    expect(all.find((t) => t.id === tag.id)?.archived).toBe(true);
  });
});

describe('seedDefaultTags', () => {
  it('creates the 8 default tags, in order, when the tag store is empty', async () => {
    await seedDefaultTags(db);
    const all = await listAllTags(db);
    expect(all.map((t) => t.name)).toEqual([
      '잘 모르겠음', '익절', '손절', '실적발표', '뉴스/이슈', '기술적분석', '거시경제', '리밸런싱',
    ]);
  });

  it('does not seed again (or duplicate) if any tag already exists', async () => {
    await createTag(db, '기존태그');
    await seedDefaultTags(db);
    const all = await listAllTags(db);
    expect(all.map((t) => t.name)).toEqual(['기존태그']);
  });
});
