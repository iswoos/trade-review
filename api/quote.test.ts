import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './quote';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  process.env.TWELVE_DATA_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/quote', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('routes Korean symbols (.KS) to Yahoo Finance and reports currency as KRW', async () => {
    const regularMarketTime = Math.floor(Date.UTC(2026, 6, 23) / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: { regularMarketPrice: 71000, regularMarketTime, gmtoffset: 32400, currency: 'KRW' },
                timestamp: [regularMarketTime],
                indicators: { quote: [{ open: [71000], high: [71000], low: [71000], close: [71000] }] },
              },
            ],
            error: null,
          },
        }),
      })
    );
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: '005930.KS', price: 71000, currency: 'KRW', dailyChangePercent: null });
  });

  it('returns 502 when the Yahoo Finance lookup fails for a Korean symbol', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to Twelve Data and reports currency as USD', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbol: 'AAPL', close: '320.27' }) })
    );
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: 'AAPL', price: 320.27, currency: 'USD', dailyChangePercent: null });
  });

  it('returns 502 when the Twelve Data lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
