import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTag } from '../db/tags';
import { TagManagementScreen } from './TagManagementScreen';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  db = await openTradeReviewDB();
});

afterEach(() => {
  db.close();
});

describe('TagManagementScreen', () => {
  it('creates a new tag and shows it in the list immediately', async () => {
    render(<TagManagementScreen db={db} onBack={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('새 태그 이름'), '장기투자');
    await userEvent.click(screen.getByRole('button', { name: '태그 추가' }));
    expect(await screen.findByText('장기투자')).toBeInTheDocument();
  });

  it('renames a tag inline and shows the updated name', async () => {
    const tag = await createTag(db, '감');
    render(<TagManagementScreen db={db} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: tag.name }));
    const input = screen.getByLabelText('감 이름 수정');
    await userEvent.clear(input);
    await userEvent.type(input, '직감{Enter}');
    expect(await screen.findByText('직감')).toBeInTheDocument();
    expect(screen.queryByText('감')).not.toBeInTheDocument();
  });

  it('deletes a tag and removes it from the visible list', async () => {
    await createTag(db, '지인추천');
    render(<TagManagementScreen db={db} onBack={vi.fn()} />);
    await screen.findByText('지인추천');
    await userEvent.click(screen.getByRole('button', { name: '지인추천 삭제' }));
    await waitFor(() => expect(screen.queryByText('지인추천')).not.toBeInTheDocument());
  });

  it('calls onBack when the home button is clicked', async () => {
    const onBack = vi.fn();
    render(<TagManagementScreen db={db} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: '홈' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
