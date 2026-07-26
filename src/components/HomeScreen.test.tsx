import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeScreen } from './HomeScreen';
import * as quotes from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

vi.mock('../api/quotes');

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    avgCost: 100,
    lastTradeAt: '2025-01-01T00:00:00.000Z',
    currentPrice: 110,
    buyCnt: 0,
    sellCnt: 0,
    noteCnt: 0,
    ...overrides,
  };
}

describe('HomeScreen', () => {
  it('renders each position with ticker, avg cost, current price, and P&L percent', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(<HomeScreen positions={[item()]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    const row = screen.getByRole('button', { name: /AAPL/ });
    expect(row).toHaveTextContent('Apple Inc.');
    expect(row).toHaveTextContent('100');
    expect(row).toHaveTextContent('110');
    expect(row).toHaveTextContent('+10.0%');
  });

  it('calls onSelectTicker when a position row is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSelectTicker = vi.fn();
    render(<HomeScreen positions={[item()]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={onSelectTicker} onOpenTagManagement={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /AAPL/ }));
    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('calls onSortOrderChange when the sort select changes', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSortOrderChange = vi.fn();
    render(<HomeScreen positions={[item()]} sortOrder="recent" onSortOrderChange={onSortOrderChange} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('정렬 기준'), '이름순');
    expect(onSortOrderChange).toHaveBeenCalledWith('alphabetical');
  });

  it('selecting a search result calls onSelectTicker directly (chart-first entry, no trade required)', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
    const onSelectTicker = vi.fn();
    render(<HomeScreen positions={[]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={onSelectTicker} onOpenTagManagement={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('JOBY', '조비');
  });

  it('shows the lightweight-charts attribution link', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(<HomeScreen positions={[]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    const link = screen.getByRole('link', { name: /TradingView Lightweight Charts/ });
    expect(link).toHaveAttribute('href', 'https://www.tradingview.com/');
  });

  it('calls onOpenTagManagement when the tag management button is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onOpenTagManagement = vi.fn();
    render(
      <HomeScreen
        positions={[]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={vi.fn()}
        onOpenTagManagement={onOpenTagManagement}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: '태그 관리' }));
    expect(onOpenTagManagement).toHaveBeenCalledOnce();
  });
});
