import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Tag } from '../types';
import { listActiveTags, createTag, renameTag, archiveTag } from '../db/tags';

interface TagManagementScreenProps {
  db: IDBPDatabase<TradeReviewDB>;
  onBack: () => void;
}

export function TagManagementScreen({ db, onBack }: TagManagementScreenProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newTagName, setNewTagName] = useState('');

  async function reload() {
    setTags(await listActiveTags(db));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  function startEditing(tag: Tag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  async function commitRename() {
    if (editingId && editingName.trim()) {
      await renameTag(db, editingId, editingName.trim());
      await reload();
    }
    setEditingId(null);
  }

  async function handleArchive(id: string) {
    await archiveTag(db, id);
    await reload();
  }

  async function handleCreate() {
    if (!newTagName.trim()) return;
    await createTag(db, newTagName.trim());
    setNewTagName('');
    await reload();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="홈"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          ⌂
        </button>
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">태그 관리</h2>
      </div>

      <ul aria-label="태그 목록" className="flex flex-col gap-2">
        {tags.map((tag) => (
          <li
            key={tag.id}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {editingId === tag.id ? (
              <input
                aria-label={`${tag.name} 이름 수정`}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                }}
                autoFocus
                className="flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            ) : (
              <button
                type="button"
                onClick={() => startEditing(tag)}
                className="flex-1 text-left text-sm text-zinc-800 dark:text-zinc-200"
              >
                {tag.name}
              </button>
            )}
            <button
              type="button"
              aria-label={`${tag.name} 보관`}
              onClick={() => handleArchive(tag.id)}
              className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              보관
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          aria-label="새 태그 이름"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="새 태그"
          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white"
        >
          + 새 태그
        </button>
      </div>
    </div>
  );
}
