import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagPicker } from './TagPicker';

const tags = [
  { id: '1', name: '팩트', archived: false, createdAt: new Date().toISOString(), order: 0 },
  { id: '2', name: '감', archived: false, createdAt: new Date().toISOString(), order: 1 },
];

describe('TagPicker', () => {
  it('toggles a tag into the selection on click', async () => {
    const onChange = vi.fn();
    render(<TagPicker tags={tags} selectedIds={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(onChange).toHaveBeenCalledWith(['1']);
  });

  it('toggles a selected tag back out of the selection', async () => {
    const onChange = vi.fn();
    render(<TagPicker tags={tags} selectedIds={['1']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
