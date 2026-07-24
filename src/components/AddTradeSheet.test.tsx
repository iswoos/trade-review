import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTag } from '../db/tags';
import { AddTradeSheet } from './AddTradeSheet';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes');

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  db = await openTradeReviewDB();
  vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 11.36, currency: 'USD' });
});

afterEach(() => {
  db.close();
});

describe('AddTradeSheet', () => {
  it('prefills the fill price from a live quote for the given ticker', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
  });

  it('saves a trade for the given ticker with a tag, and reports it via onSaved', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.ticker).toBe('JOBY');
    expect(saved.quantity).toBe(100);
    expect(saved.rationaleTagIds).toEqual([tag.id]);
  });

  it('allows saving with no tag, no conviction, and no memo (wellbeing: nothing is required)', async () => {
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onSaved.mock.calls[0][0].rationaleTagIds).toEqual([]);
  });

  it('saves datetime as null and datetimeUnknown as true when "시간 모름/예약매매" is toggled on', async () => {
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '시간 모름 / 예약매매' }));
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBeNull();
    expect(saved.datetimeUnknown).toBe(true);
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={onClose} />);
    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
