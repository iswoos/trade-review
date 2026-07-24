import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './search';

vi.mock('../src/data/krx-listing.json', () => ({
  default: [
    { symbol: '005930.KS', name: '삼성전자' },
    { symbol: '035720.KQ', name: '카카오' },
  ],
}));

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockTwelveDataSearchOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

function mockTwelveDataSearchFail() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
}

beforeEach(() => {
  process.env.TWELVE_DATA_API_KEY = 'test-key';
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

  it('merges KR bundled-listing matches with Twelve Data results', async () => {
    mockTwelveDataSearchOk({ data: [{ symbol: 'AAPL', instrument_name: 'Apple Inc', exchange: 'NASDAQ' }] });

    const res = mockRes();
    await handler({ query: { q: '삼성' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [
        { symbol: '005930.KS', name: '삼성전자', exchange: 'KOSPI' },
        { symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' },
      ],
    });
  });

  it('returns only KR matches when Twelve Data fails, without a 502', async () => {
    mockTwelveDataSearchFail();

    const res = mockRes();
    await handler({ query: { q: '카카오' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: '035720.KQ', name: '카카오', exchange: 'KOSDAQ' }],
    });
  });

  it('returns an empty list when nothing matches on either side', async () => {
    mockTwelveDataSearchOk({ data: [] });

    const res = mockRes();
    await handler({ query: { q: 'zzzznomatch' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({ symbols: [] });
  });
});
