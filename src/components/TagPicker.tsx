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
    <div role="group" aria-label="근거 태그">
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          aria-pressed={selectedIds.includes(tag.id)}
          onClick={() => toggle(tag.id)}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
