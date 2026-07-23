import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTag } from '../db/tags';
import { TradeForm } from './TradeForm';
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
  vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
  vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 11.36, currency: 'USD' });
});

afterEach(async () => {
  db.close();
});

describe('TradeForm', () => {
  it('saves a trade after selecting a symbol, a tag, and clicking save', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<TradeForm db={db} availableTags={[tag]} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));

    await screen.findByDisplayValue('11.36'); // auto-filled fill price

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
    render(<TradeForm db={db} availableTags={[]} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onSaved.mock.calls[0][0].rationaleTagIds).toEqual([]);
  });

  it('saves the selected past date as the trade datetime', async () => {
    const onSaved = vi.fn();
    render(<TradeForm db={db} availableTags={[]} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');

    const dateInput = screen.getByLabelText('체결 날짜');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2025-07-10');

    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBe(new Date('2025-07-10').toISOString());
    expect(saved.datetimeUnknown).toBe(false);
  });

  it('saves datetime as null and datetimeUnknown as true when "시간 모름/예약매매" is toggled on', async () => {
    const onSaved = vi.fn();
    render(<TradeForm db={db} availableTags={[]} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');

    await userEvent.click(screen.getByRole('button', { name: '시간 모름 / 예약매매' }));
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBeNull();
    expect(saved.datetimeUnknown).toBe(true);
  });
});
