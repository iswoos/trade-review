import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isKoreanSymbol, fmpQuote, fmpSearch, fmpHistory } from './fmp';

describe('isKoreanSymbol', () => {
  it('returns true for .KS suffix', () => {
    expect(isKoreanSymbol('005930.KS')).toBe(true);
  });

  it('returns true for .KQ suffix', () => {
    expect(isKoreanSymbol('123456.KQ')).toBe(true);
  });

  it('returns false for US symbols', () => {
    expect(isKoreanSymbol('AAPL')).toBe(false);
  });
});

describe('FMP client', () => {
  beforeEach(() => {
    process.env.FMP_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fmpQuote returns the first result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ symbol: 'AAPL', price: 320.27 }],
      }),
    );
    const quote = await fmpQuote('AAPL');
    expect(quote).toEqual({ symbol: 'AAPL', price: 320.27 });
  });

  it('fmpQuote throws when FMP returns no data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    await expect(fmpQuote('AAPL')).rejects.toThrow();
  });

  it('fmpQuote throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fmpQuote('AAPL')).rejects.toThrow();
  });

  it('fmpSearch maps FMP fields to {symbol, name, exchange}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
      }),
    );
    const results = await fmpSearch('apple');
    expect(results).toEqual([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
  });

  it('fmpQuote requests the stable quote endpoint with the symbol', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ symbol: 'AAPL', price: 320.27 }],
    });
    vi.stubGlobal('fetch', fetchMock);
    await fmpQuote('AAPL');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/stable/quote?');
    expect(url).toContain('symbol=AAPL');
  });

  it('fmpSearch requests the stable search-name endpoint with the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    await fmpSearch('apple');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/stable/search-name?');
    expect(url).toContain('query=apple');
  });

  it('fmpHistory requests the stable historical-price-eod/light endpoint with the symbol', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    await fmpHistory('AAPL');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/stable/historical-price-eod/light?');
    expect(url).toContain('symbol=AAPL');
  });

  it('fmpHistory reverses newest-first data to oldest-first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { symbol: 'AAPL', date: '2026-07-18', price: 7.39 },
          { symbol: 'AAPL', date: '2026-07-17', price: 7.1 },
        ],
      }),
    );
    const bars = await fmpHistory('AAPL');
    expect(bars).toEqual([
      { date: '2026-07-17', price: 7.1 },
      { date: '2026-07-18', price: 7.39 },
    ]);
  });
});
