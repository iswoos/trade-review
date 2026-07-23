// src/api/quotes.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchSymbols, fetchQuote, fetchHistory } from './quotes';

afterEach(() => {
  vi.unstubAllGlobals();
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
