import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TickerSearch } from './TickerSearch';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/quotes')>();
  return { ...actual, searchSymbols: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
    expect(await screen.findByRole('button', { name: /Joby Clone \(JOBY2\)/ })).toBeInTheDocument();
  });

  it('calls onSelectTicker with the ticker and name, and clears the query, when a result is clicked', async () => {
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

    const input = screen.getByLabelText('종목 검색') as HTMLInputElement;
    await userEvent.type(input, 'apple');
    await userEvent.click(await screen.findByRole('button', { name: /Apple Inc\. \(AAPL\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
    expect(input.value).toBe('');
    expect(screen.queryByRole('list', { name: '내 포지션 검색 결과' })).not.toBeInTheDocument();
  });

  it('clears the query when the clear (X) button is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);

    const input = screen.getByLabelText('종목 검색') as HTMLInputElement;
    await userEvent.type(input, 'apple');
    await userEvent.click(await screen.findByRole('button', { name: '검색어 지우기' }));

    expect(input.value).toBe('');
    expect(screen.queryByRole('list', { name: '신규 검색 결과' })).not.toBeInTheDocument();
  });

  it('clears the query when clicking outside the search component', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(
      <div>
        <TickerSearch positions={[]} onSelectTicker={vi.fn()} />
        <button type="button">바깥 영역</button>
      </div>
    );

    const input = screen.getByLabelText('종목 검색') as HTMLInputElement;
    await userEvent.type(input, 'apple');
    await screen.findByRole('list', { name: '신규 검색 결과' });

    await userEvent.click(screen.getByRole('button', { name: '바깥 영역' }));

    expect(input.value).toBe('');
    expect(screen.queryByRole('list', { name: '신규 검색 결과' })).not.toBeInTheDocument();
  });

  it('shows no result lists when the query is empty', () => {
    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);
    expect(screen.queryByRole('list', { name: '내 포지션 검색 결과' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '신규 검색 결과' })).not.toBeInTheDocument();
  });

  it('debounces rapid edits into a single call, and still ignores a stale out-of-order response', async () => {
    vi.useFakeTimers();
    // The mock is shared across every test in this file (no clearMocks/restoreMocks
    // config), so earlier tests' calls to searchSymbols would otherwise leak into
    // this test's call-count assertions.
    vi.mocked(quotes.searchSymbols).mockClear();
    let resolveFirst!: (value: quotes.SymbolResult[]) => void;
    let resolveSecond!: (value: quotes.SymbolResult[]) => void;

    vi.mocked(quotes.searchSymbols)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));

    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);
    const input = screen.getByLabelText('종목 검색');

    fireEvent.change(input, { target: { value: 'j' } });
    fireEvent.change(input, { target: { value: 'jo' } });

    // Rapid "j" -> "jo" edit collapses into exactly one debounced call, for the final value.
    await vi.advanceTimersByTimeAsync(500);
    expect(quotes.searchSymbols).toHaveBeenCalledTimes(1);
    expect(quotes.searchSymbols).toHaveBeenCalledWith('jo');

    // A later, separately-debounced query.
    fireEvent.change(input, { target: { value: 'joby' } });
    await vi.advanceTimersByTimeAsync(500);
    expect(quotes.searchSymbols).toHaveBeenCalledTimes(2);

    vi.useRealTimers();

    // Resolve out of order: the later-issued query ("joby") resolves first,
    // then the stale earlier query ("jo") resolves after.
    resolveSecond([{ symbol: 'JOBY', name: 'Joby Aviation', exchange: 'NYQ' }]);
    resolveFirst([{ symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYQ' }]);

    expect(await screen.findByRole('button', { name: /Joby Aviation \(JOBY\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Johnson & Johnson \(JNJ\)/ })).not.toBeInTheDocument();
  });

  it('searches instantly (no debounce) for a Korean-language query', async () => {
    vi.mocked(quotes.searchSymbols).mockClear();
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: '005930', name: '삼성전자', exchange: 'KRX' }]);

    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('종목 검색'), { target: { value: '삼성' } });

    // No timer advance — searchSymbols must have already been called synchronously.
    expect(quotes.searchSymbols).toHaveBeenCalledWith('삼성');
    expect(await screen.findByRole('button', { name: /삼성전자 \(005930\)/ })).toBeInTheDocument();
  });

  it('still debounces a non-Korean query even after a prior Korean-language search', async () => {
    vi.useFakeTimers();
    vi.mocked(quotes.searchSymbols).mockClear();
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);

    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);
    const input = screen.getByLabelText('종목 검색');

    fireEvent.change(input, { target: { value: 'j' } });
    expect(quotes.searchSymbols).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(quotes.searchSymbols).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
