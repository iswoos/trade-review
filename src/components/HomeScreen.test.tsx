import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { HomeScreen } from './HomeScreen';
import * as quotes from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

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
  vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
});

afterEach(() => db.close());

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    avgCost: 100,
    lastTradeAt: '2025-01-01T00:00:00.000Z',
    currentPrice: 110,
    ...overrides,
  };
}

describe('HomeScreen', () => {
  it('renders each position with ticker, avg cost, current price, and P&L percent', () => {
    render(
      <HomeScreen
        db={db}
        positions={[item()]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={vi.fn()}
        onImported={vi.fn()}
      />
    );

    const row = screen.getByRole('button', { name: /AAPL/ });
    expect(row).toHaveTextContent('Apple Inc.');
    expect(row).toHaveTextContent('평단 100');
    expect(row).toHaveTextContent('현재가 110');
    expect(row).toHaveTextContent('+10.0%');
  });

  it('calls onSelectTicker when a position row is clicked', async () => {
    const onSelectTicker = vi.fn();
    render(
      <HomeScreen
        db={db}
        positions={[item()]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={onSelectTicker}
        onImported={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /AAPL/ }));
    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('calls onSortOrderChange when the sort select changes', async () => {
    const onSortOrderChange = vi.fn();
    render(
      <HomeScreen
        db={db}
        positions={[item()]}
        sortOrder="recent"
        onSortOrderChange={onSortOrderChange}
        onSelectTicker={vi.fn()}
        onImported={vi.fn()}
      />
    );

    await userEvent.selectOptions(screen.getByLabelText('정렬 기준'), '이름순');
    expect(onSortOrderChange).toHaveBeenCalledWith('alphabetical');
  });

  it('selecting a search result calls onSelectTicker directly (chart-first entry, no trade required)', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
    const onSelectTicker = vi.fn();
    render(
      <HomeScreen
        db={db}
        positions={[]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={onSelectTicker}
        onImported={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('JOBY', '조비');
  });
});
