import type { Tag } from '../types';

interface TagPickerProps {
  tags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TagPicker({ tags, selectedIds, onChange }: TagPickerProps) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((existing) => existing !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div role="group" aria-label="근거 태그" className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          aria-pressed={selectedIds.includes(tag.id)}
          onClick={() => toggle(tag.id)}
          className={
            selectedIds.includes(tag.id)
              ? 'rounded-full bg-accent px-3 py-1 text-xs font-bold text-white'
              : 'rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
          }
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
