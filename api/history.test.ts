import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './history';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  process.env.DATA_GO_KR_API_KEY = 'test-key';
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

  it('routes Korean symbols (.KS) to data.go.kr and maps rows to {date, open, high, low, close} bars, oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            header: { resultCode: '00', resultMsg: 'OK' },
            body: {
              items: {
                item: [
                  { basDt: '20260718', srtnCd: '005930', clpr: '72000', mkp: '71500', hipr: '72500', lopr: '71000' },
                  { basDt: '20260717', srtnCd: '005930', clpr: '71000', mkp: '70500', hipr: '71500', lopr: '70000' },
                ],
              },
              numOfRows: 2,
              pageNo: 1,
              totalCount: 2,
            },
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

  it('returns 502 when data.go.kr lookup fails for a Korean symbol', async () => {
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
