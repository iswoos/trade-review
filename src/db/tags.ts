import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Tag } from '../types';

export async function createTag(db: IDBPDatabase<TradeReviewDB>, name: string): Promise<Tag> {
  const existing = await db.getAll('tags');
  const maxOrder = existing.length === 0 ? -1 : Math.max(...existing.map((t) => t.order ?? -1));
  const tag: Tag = { id: crypto.randomUUID(), name, archived: false, createdAt: new Date().toISOString(), order: maxOrder + 1 };
  await db.put('tags', tag);
  return tag;
}

export async function renameTag(db: IDBPDatabase<TradeReviewDB>, id: string, name: string): Promise<void> {
  const tag = await db.get('tags', id);
  if (!tag) throw new Error(`Tag not found: ${id}`);
  await db.put('tags', { ...tag, name });
}

export async function archiveTag(db: IDBPDatabase<TradeReviewDB>, id: string): Promise<void> {
  const tag = await db.get('tags', id);
  if (!tag) throw new Error(`Tag not found: ${id}`);
  await db.put('tags', { ...tag, archived: true });
}

export async function listActiveTags(db: IDBPDatabase<TradeReviewDB>): Promise<Tag[]> {
  const all = await db.getAll('tags');
  return all.filter((t) => !t.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function listAllTags(db: IDBPDatabase<TradeReviewDB>): Promise<Tag[]> {
  const tags = await db.getAll('tags');
  return tags.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

const DEFAULT_TAG_NAMES = [
  '잘 모르겠음', '익절', '손절', '실적발표', '뉴스/이슈', '기술적분석', '거시경제', '리밸런싱',
];

export async function seedDefaultTags(db: IDBPDatabase<TradeReviewDB>): Promise<void> {
  const existing = await listAllTags(db);
  if (existing.length > 0) return;
  for (const name of DEFAULT_TAG_NAMES) {
    await createTag(db, name);
  }
}
