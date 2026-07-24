import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { twelveDataQuote, twelveDataHistory, twelveDataSearch } from './twelveData';

beforeEach(() => {
  process.env.TWELVE_DATA_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('twelveDataQuote', () => {
  it('returns symbol and price parsed from the close field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbol: 'AAPL', close: '320.27' }) })
    );
    const quote = await twelveDataQuote('AAPL');
    expect(quote).toEqual({ symbol: 'AAPL', price: 320.27 });
  });

  it('requests the quote endpoint with the symbol', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ symbol: 'AAPL', close: '320.27' }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataQuote('AAPL');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/quote?');
    expect(url).toContain('symbol=AAPL');
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(twelveDataQuote('AAPL')).rejects.toThrow();
  });

  it('throws when the body reports status "error" despite a 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'error', message: 'bad symbol' }) })
    );
    await expect(twelveDataQuote('BAD')).rejects.toThrow();
  });
});

describe('twelveDataHistory', () => {
  it('maps values to {date, price}, reversed to oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', close: '7.39' },
            { datetime: '2026-07-17', close: '7.1' },
          ],
        }),
      })
    );
    const bars = await twelveDataHistory('JOBY');
    expect(bars).toEqual([
      { date: '2026-07-17', price: 7.1 },
      { date: '2026-07-18', price: 7.39 },
    ]);
  });

  it('requests the time_series endpoint with a 1day interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ values: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataHistory('JOBY');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/time_series?');
    expect(url).toContain('symbol=JOBY');
    expect(url).toContain('interval=1day');
  });
});

describe('twelveDataSearch', () => {
  it('maps Twelve Data fields to {symbol, name, exchange}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ symbol: 'AAPL', instrument_name: 'Apple Inc', exchange: 'NASDAQ' }] }),
      })
    );
    const results = await twelveDataSearch('apple');
    expect(results).toEqual([{ symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' }]);
  });

  it('requests the symbol_search endpoint with the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataSearch('apple');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/symbol_search?');
    expect(url).toContain('symbol=apple');
  });
});
