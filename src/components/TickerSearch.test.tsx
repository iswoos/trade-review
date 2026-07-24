import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TickerSearch } from './TickerSearch';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/quotes')>();
  return { ...actual, searchSymbols: vi.fn() };
});

afterEach(() => cleanup());

describe('TickerSearch', () => {
  it('groups matching held positions separately from new API search results', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY2', name: 'Joby Clone', exchange: 'NYQ' }]);

    render(
      <TickerSearch
        positions={[
          { ticker: 'JOBY', name: '조비', avgCost: 10, lastTradeAt: '2025-01-01T00:00:00.000Z', currentPrice: 11 },
        ]}
        onSelectTicker={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');

    expect(await screen.findByRole('list', { name: '내 포지션 검색 결과' })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: '신규 검색 결과' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /조비 \(JOBY\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Joby Clone \(JOBY2\)/ })).toBeInTheDocument();
  });

  it('calls onSelectTicker with the ticker and name when a result is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSelectTicker = vi.fn();

    render(
      <TickerSearch
        positions={[
          { ticker: 'AAPL', name: 'Apple Inc.', avgCost: 100, lastTradeAt: '2025-01-01T00:00:00.000Z', currentPrice: 110 },
        ]}
        onSelectTicker={onSelectTicker}
      />
    );

    await userEvent.type(screen.getByLabelText('종목 검색'), 'apple');
    await userEvent.click(await screen.findByRole('button', { name: /Apple Inc\. \(AAPL\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('shows no result lists when the query is empty', () => {
    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);
    expect(screen.queryByRole('list', { name: '내 포지션 검색 결과' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '신규 검색 결과' })).not.toBeInTheDocument();
  });
});
