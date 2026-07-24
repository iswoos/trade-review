import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './quote';

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

describe('GET /api/quote', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('routes Korean symbols (.KS) to data.go.kr and reports currency as KRW', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            header: { resultCode: '00', resultMsg: 'OK' },
            body: {
              items: { item: [{ basDt: '20260723', srtnCd: '005930', clpr: '71000' }] },
              numOfRows: 1,
              pageNo: 1,
              totalCount: 1,
            },
          },
        }),
      })
    );
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: '005930.KS', price: 71000, currency: 'KRW' });
  });

  it('returns 502 when data.go.kr lookup fails for a Korean symbol', async () => {
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
    expect(res.json).toHaveBeenCalledWith({ symbol: 'AAPL', price: 320.27, currency: 'USD' });
  });

  it('returns 502 when the Twelve Data lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
