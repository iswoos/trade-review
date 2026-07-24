import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './search';

vi.mock('yahoo-finance2', () => ({
  default: { search: vi.fn() },
}));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockFmpSearchOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

function mockFmpSearchFail() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
}

beforeEach(() => {
  vi.mocked(yahooFinance.search).mockReset();
  process.env.FMP_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('merges results from FMP and yahoo-finance2, deduped by symbol (FMP wins on collision)', async () => {
    mockFmpSearchOk([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
    vi.mocked(yahooFinance.search).mockResolvedValue({
      quotes: [{ symbol: 'AAPL', shortname: 'Apple Inc', exchange: 'NMS' }],
    } as any);

    const res = mockRes();
    await handler({ query: { q: 'apple' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
    });
  });

  it('returns yahoo-finance2 results when FMP fails', async () => {
    mockFmpSearchFail();
    vi.mocked(yahooFinance.search).mockResolvedValue({
      quotes: [{ symbol: '005930.KS', shortname: 'Samsung Electronics', exchange: 'KSC' }],
    } as any);

    const res = mockRes();
    await handler({ query: { q: '삼성' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: '005930.KS', name: 'Samsung Electronics', exchange: 'KSC' }],
    });
  });

  it('returns FMP results when yahoo-finance2 fails', async () => {
    mockFmpSearchOk([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
    vi.mocked(yahooFinance.search).mockRejectedValue(new Error('upstream down'));

    const res = mockRes();
    await handler({ query: { q: 'apple' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
    });
  });

  it('returns 502 when both sources fail', async () => {
    mockFmpSearchFail();
    vi.mocked(yahooFinance.search).mockRejectedValue(new Error('upstream down'));

    const res = mockRes();
    await handler({ query: { q: 'apple' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });
});
