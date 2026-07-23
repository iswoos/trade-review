import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Tag } from '../types';

export async function createTag(db: IDBPDatabase<TradeReviewDB>, name: string): Promise<Tag> {
  const tag: Tag = { id: crypto.randomUUID(), name, archived: false };
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
  return all.filter((t) => !t.archived);
}

export async function listAllTags(db: IDBPDatabase<TradeReviewDB>): Promise<Tag[]> {
  return db.getAll('tags');
}
