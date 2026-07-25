import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.ticker).toBe('JOBY');
    expect(saved.quantity).toBe(100);
    expect(saved.rationaleTagIds).toEqual([tag.id]);
    expect(saved.datetimeUnknown).toBe(false);
  });

  it('disables save until date, price, quantity, and at least one tag are all filled in', async () => {
    const tag = await createTag(db, '팩트');
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={vi.fn()} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜') as HTMLInputElement;
    const saveButton = screen.getByRole('button', { name: '저장' });

    // Date defaults to today and price is prefilled, but quantity and tag are still empty.
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    expect(saveButton).toBeDisabled(); // quantity filled, still no tag

    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(saveButton).not.toBeDisabled(); // all required fields present, time left blank

    await userEvent.clear(dateInput);
    expect(saveButton).toBeDisabled(); // date cleared
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={onClose} />);
    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('combines date and time into the saved datetime when a time is provided', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2025-07-10');
    await userEvent.type(screen.getByLabelText('체결 시각'), '09:30');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBe(new Date('2025-07-10T09:30').toISOString());
  });

  it('saves date-only (midnight) when the time field is left blank', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜') as HTMLInputElement;
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBe(new Date(dateInput.value).toISOString());
  });
});
