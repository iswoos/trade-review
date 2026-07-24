// src/api/quotes.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchSymbols, fetchQuote, fetchHistory } from './quotes';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('searchSymbols', () => {
  it('returns [] for an empty query without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchSymbols('  ');
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns parsed symbols on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbols: [{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }] }) })
    );
    const result = await searchSymbols('joby');
    expect(result).toEqual([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
  });

  it('falls back to [] on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await searchSymbols('joby');
    expect(result).toEqual([]);
  });
});

describe('fetchQuote', () => {
  it('falls back to null on network failure (manual entry fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchQuote('JOBY');
    expect(result).toBeNull();
  });
});

describe('fetchHistory', () => {
  it('falls back to [] on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchHistory('JOBY');
    expect(result).toEqual([]);
  });
});

describe('fetchQuote caching', () => {
  it('does not call fetch again for the same symbol within the cache TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: 100, currency: 'USD' }) });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchQuote('CACHE_TEST_QUOTE_1');
    const second = await fetchQuote('CACHE_TEST_QUOTE_1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('calls fetch again once the 5-minute cache TTL has expired', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: 100, currency: 'USD' }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuote('CACHE_TEST_QUOTE_2');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetchQuote('CACHE_TEST_QUOTE_2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not cache a failed lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await fetchQuote('CACHE_TEST_QUOTE_3');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: 200, currency: 'USD' }) })
    );
    const result = await fetchQuote('CACHE_TEST_QUOTE_3');

    expect(result).toEqual({ price: 200, currency: 'USD' });
  });
});

describe('fetchHistory caching', () => {
  it('does not call fetch again for the same symbol within the cache TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bars: [{ date: '2026-07-17', close: 100 }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchHistory('CACHE_TEST_HISTORY_1');
    const second = await fetchHistory('CACHE_TEST_HISTORY_1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('calls fetch again once the 5-minute cache TTL has expired', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bars: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchHistory('CACHE_TEST_HISTORY_2');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetchHistory('CACHE_TEST_HISTORY_2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
