import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './quote';

vi.mock('yahoo-finance2', () => ({ default: { quote: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.mocked(yahooFinance.quote).mockReset();
});

describe('GET /api/quote', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns the current price and currency', async () => {
    vi.mocked(yahooFinance.quote).mockResolvedValue({
      symbol: 'JOBY',
      regularMarketPrice: 7.39,
      currency: 'USD',
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: 'JOBY', price: 7.39, currency: 'USD' });
  });

  it('returns 502 on upstream failure', async () => {
    vi.mocked(yahooFinance.quote).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
