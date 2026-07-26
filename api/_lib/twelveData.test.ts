import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { twelveDataQuote, twelveDataHistory, twelveDataSearch, twelveDataFxRate } from './twelveData';

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
  it('maps values to {date, open, high, low, price}, reversed to oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', open: '7.2', high: '7.45', low: '7.05', close: '7.39' },
            { datetime: '2026-07-17', open: '7.0', high: '7.15', low: '6.95', close: '7.1' },
          ],
        }),
      })
    );
    const bars = await twelveDataHistory('JOBY');
    expect(bars).toEqual([
      { date: '2026-07-17', open: 7.0, high: 7.15, low: 6.95, price: 7.1 },
      { date: '2026-07-18', open: 7.2, high: 7.45, low: 7.05, price: 7.39 },
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

  it('requests a large outputsize so a single call covers many years of history', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ values: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataHistory('JOBY');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('outputsize')).toBe('5000');
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

describe('twelveDataFxRate', () => {
  it('returns the closing USD/KRW rate nearest to (on or before) the given date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', open: '1350', high: '1360', low: '1345', close: '1352.5' },
            { datetime: '2026-07-17', open: '1348', high: '1355', low: '1340', close: '1350.0' },
          ],
        }),
      })
    );
    const rate = await twelveDataFxRate('2026-07-18');
    expect(rate).toBe(1352.5);
  });

  it('requests a 7-day lookback window ending on the given date, for USD/KRW', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: [{ datetime: '2026-07-18', open: '1350', high: '1360', low: '1345', close: '1352.5' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataFxRate('2026-07-18');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toContain('/time_series');
    expect(url.searchParams.get('symbol')).toBe('USD/KRW');
    expect(url.searchParams.get('start_date')).toBe('2026-07-11');
    expect(url.searchParams.get('end_date')).toBe('2026-07-18');
  });

  it('throws when no rate is available in the lookback window', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ values: [] }) }));
    await expect(twelveDataFxRate('2026-07-18')).rejects.toThrow();
  });
});
