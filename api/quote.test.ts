import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './quote';

vi.mock('yahoo-finance2', () => ({ default: { quote: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockFmpQuoteOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

beforeEach(() => {
  vi.mocked(yahooFinance.quote).mockReset();
  process.env.FMP_API_KEY = 'test-key';
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

  it('routes Korean symbols (.KS) to yahoo-finance2', async () => {
    vi.mocked(yahooFinance.quote).mockResolvedValue({
      symbol: '005930.KS',
      regularMarketPrice: 71000,
      currency: 'KRW',
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: '005930.KS', price: 71000, currency: 'KRW' });
  });

  it('returns 502 when yahoo-finance2 throws for a Korean symbol', async () => {
    vi.mocked(yahooFinance.quote).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to FMP and reports currency as USD', async () => {
    mockFmpQuoteOk([{ symbol: 'AAPL', price: 320.27 }]);
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: 'AAPL', price: 320.27, currency: 'USD' });
  });

  it('returns 502 when the FMP lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
