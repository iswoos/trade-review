import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './history';

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

describe('GET /api/history', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('routes Korean symbols (.KS) to Yahoo Finance and maps rows to {date, open, high, low, close} bars, oldest first', async () => {
    const ts17 = Math.floor(Date.UTC(2026, 6, 17) / 1000);
    const ts18 = Math.floor(Date.UTC(2026, 6, 18) / 1000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: { regularMarketPrice: 72000, regularMarketTime: ts18, gmtoffset: 32400, currency: 'KRW' },
                timestamp: [ts17, ts18],
                indicators: {
                  quote: [{ open: [70500, 71500], high: [71500, 72500], low: [70000, 71000], close: [71000, 72000] }],
                },
              },
            ],
            error: null,
          },
        }),
      })
    );
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-17', open: 70500, high: 71500, low: 70000, close: 71000 },
        { date: '2026-07-18', open: 71500, high: 72500, low: 71000, close: 72000 },
      ],
    });
  });

  it('returns 502 when the Yahoo Finance lookup fails for a Korean symbol', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to Twelve Data and maps open/high/low/close, oldest first', async () => {
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
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-17', open: 7.0, high: 7.15, low: 6.95, close: 7.1 },
        { date: '2026-07-18', open: 7.2, high: 7.45, low: 7.05, close: 7.39 },
      ],
    });
  });

  it('returns 502 when the Twelve Data lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
