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
    render(<HomeScreen positions={[item()]} usdKrwRate={null} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    const row = screen.getByRole('button', { name: /AAPL/ });
    expect(row).toHaveTextContent('Apple Inc.');
    expect(row).toHaveTextContent('100');
    expect(row).toHaveTextContent('110');
    expect(row).toHaveTextContent('+10.00%');
  });

  it('calls onSelectTicker when a position row is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSelectTicker = vi.fn();
    render(<HomeScreen positions={[item()]} usdKrwRate={null} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={onSelectTicker} onOpenTagManagement={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /AAPL/ }));
    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('calls onSortOrderChange when the sort select changes', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSortOrderChange = vi.fn();
    render(<HomeScreen positions={[item()]} usdKrwRate={null} sortOrder="recent" onSortOrderChange={onSortOrderChange} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('정렬 기준'), '이름순');
    expect(onSortOrderChange).toHaveBeenCalledWith('alphabetical');
  });

  it('selecting a search result calls onSelectTicker directly (chart-first entry, no trade required)', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
    const onSelectTicker = vi.fn();
    render(<HomeScreen positions={[]} usdKrwRate={null} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={onSelectTicker} onOpenTagManagement={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('JOBY', '조비');
  });

  it('shows the lightweight-charts attribution link', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(<HomeScreen positions={[]} usdKrwRate={null} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    const link = screen.getByRole('link', { name: /TradingView Lightweight Charts/ });
    expect(link).toHaveAttribute('href', 'https://www.tradingview.com/');
  });

  it('calls onOpenTagManagement when the tag management button is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onOpenTagManagement = vi.fn();
    render(
      <HomeScreen
        positions={[]}
        usdKrwRate={null}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={vi.fn()}
        onOpenTagManagement={onOpenTagManagement}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: '태그 관리' }));
    expect(onOpenTagManagement).toHaveBeenCalledOnce();
  });

  it('shows a portfolio total summing all positions, converting USD at the given rate', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const items = [
      item({ ticker: 'KR', currency: 'KRW', avgCost: 1000, currentPrice: 1100, totalQuantity: 1 }),
      item({ ticker: 'AAPL', currency: 'USD', avgCost: 100, currentPrice: 110, totalQuantity: 10 }),
    ];
    render(<HomeScreen positions={items} usdKrwRate={1300} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    expect(screen.getByText('포트폴리오 총계')).toBeInTheDocument();
    // 매입금액: 1000*1 + 100*10*1300 = 1,301,000 / 평가금액: 1100*1 + 110*10*1300 = 1,431,100
    expect(screen.getByText(/1,301,000/)).toBeInTheDocument();
    expect(screen.getByText(/1,431,100/)).toBeInTheDocument();
  });

  it('converts a USD position\'s 매입금액/평가금액 to KRW using the exchange rate, while keeping 평단가/현재가 in USD', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const usdItem = item({ currency: 'USD', avgCost: 13.06, currentPrice: 7.03, totalQuantity: 780 });
    render(<HomeScreen positions={[usdItem]} usdKrwRate={1300} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    const row = screen.getByRole('button', { name: /AAPL/ });
    // 평단가/현재가는 원래 통화(달러) 그대로
    expect(row).toHaveTextContent('13.06');
    expect(row).toHaveTextContent('7.03');
    // 매입금액/평가금액은 환율(1300)로 환산된 원화 금액
    expect(row).toHaveTextContent((13.06 * 780 * 1300).toLocaleString(undefined, { maximumFractionDigits: 2 }));
    expect(row).toHaveTextContent((7.03 * 780 * 1300).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  });

  it('falls back to showing raw USD amounts (labeled $) when no exchange rate is available', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const usdItem = item({ currency: 'USD', avgCost: 13.06, currentPrice: 7.03, totalQuantity: 780 });
    render(<HomeScreen positions={[usdItem]} usdKrwRate={null} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} onOpenTagManagement={vi.fn()} />);

    const row = screen.getByRole('button', { name: /AAPL/ });
    expect(row).toHaveTextContent((13.06 * 780).toLocaleString(undefined, { maximumFractionDigits: 2 }));
    expect(row).not.toHaveTextContent((13.06 * 780 * 1300).toLocaleString());
  });

  it('does not show a portfolio total when no position has a current price', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(
      <HomeScreen
        positions={[item({ currentPrice: null })]}
        usdKrwRate={null}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={vi.fn()}
        onOpenTagManagement={vi.fn()}
      />
    );
    expect(screen.queryByText('포트폴리오 총계')).not.toBeInTheDocument();
  });
});
