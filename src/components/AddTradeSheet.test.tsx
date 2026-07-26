import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTag } from '../db/tags';
import { createTrade } from '../db/trades';
import { AddTradeSheet } from './AddTradeSheet';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes');

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  vi.clearAllMocks();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  db = await openTradeReviewDB();
  vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 11.36, currency: 'USD' });
  vi.mocked(quotes.fetchFxRate).mockResolvedValue(null);
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

  it('shows a visible "매수/매도 이유" heading above the tag picker', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
    expect(screen.getByText('매수/매도 이유')).toBeInTheDocument();
  });

  it('shows USD currency-aware price/quantity labels for a USD-quoted ticker (default)', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
    expect(screen.getByLabelText('체결가 ($)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수량(주)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '금액($)' })).toBeInTheDocument();
  });

  it('shows KRW currency-aware price/quantity labels for a KRW-quoted ticker', async () => {
    vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 71000, currency: 'KRW' });
    render(<AddTradeSheet db={db} ticker="005930" name="삼성전자" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('71000');
    expect(screen.getByLabelText('체결가 (원)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '금액(원)' })).toBeInTheDocument();
  });

  it('does not render a conviction star rating', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
    expect(screen.queryByRole('radiogroup', { name: '확신도' })).not.toBeInTheDocument();
  });

  it('auto-fetches and displays the FX rate when switching to amount mode for a USD-quoted ticker, and saves it', async () => {
    vi.mocked(quotes.fetchFxRate).mockResolvedValue(1352.5);
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '금액($)' }));
    await screen.findByText('체결 시점 환율: 1352.5');

    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onSaved.mock.calls[0][0].fxRateAtTrade).toBe(1352.5);
  });

  it('shows a retry message and keeps save disabled when the FX rate fetch fails, and recovers on retry', async () => {
    vi.mocked(quotes.fetchFxRate).mockResolvedValue(null);
    const tag = await createTag(db, '팩트');
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={vi.fn()} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '금액($)' }));
    await screen.findByText('환율 조회 실패');

    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    vi.mocked(quotes.fetchFxRate).mockResolvedValue(1350);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('체결 시점 환율: 1350');
    expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled();
  });

  it('does not show any FX rate UI for a KRW trade, even in amount mode', async () => {
    vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 71000, currency: 'KRW' });
    render(<AddTradeSheet db={db} ticker="005930" name="삼성전자" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('71000');
    await userEvent.click(screen.getByRole('button', { name: '금액(원)' }));
    expect(screen.queryByText('환율 조회 실패')).not.toBeInTheDocument();
    expect(quotes.fetchFxRate).not.toHaveBeenCalled();
  });

  it('prefills fields when tradeToEdit is provided and updates trade on save', async () => {
    const tag = await createTag(db, '실적발표');
    const onSaved = vi.fn();
    const existingTrade = await createTrade(db, {
      ticker: 'JOBY',
      market: 'US' as const,
      name: '조비',
      currency: 'USD' as const,
      datetime: '2025-07-10T14:30:00.000Z',
      datetimeUnknown: false,
      side: 'sell' as const,
      price: 25,
      quantityType: 'shares' as const,
      quantityValue: 50,
      fxRateAtTrade: null,
      rationaleTagIds: [tag.id],
      conviction: null,
      memo: '기존 메모',
      attachment: null,
    });

    render(
      <AddTradeSheet
        db={db}
        ticker="JOBY"
        name="조비"
        availableTags={[tag]}
        tradeToEdit={existingTrade}
        onSaved={onSaved}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('25')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
    expect(screen.getByDisplayValue('기존 메모')).toBeInTheDocument();

    const priceInput = screen.getByLabelText('체결가 ($)');
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, '30');

    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.id).toBe(existingTrade.id);
    expect(saved.price).toBe(30);
  });
});

