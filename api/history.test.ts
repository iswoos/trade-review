import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './history';

vi.mock('yahoo-finance2', () => ({ default: { chart: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockFmpHistoryOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

beforeEach(() => {
  vi.mocked(yahooFinance.chart).mockReset();
  process.env.FMP_API_KEY = 'test-key';
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

  it('routes Korean symbols (.KS) to yahoo-finance2 and maps chart quotes to {date, close} bars', async () => {
    vi.mocked(yahooFinance.chart).mockResolvedValue({
      quotes: [{ date: new Date('2026-07-17T00:00:00.000Z'), close: 71000 }],
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ bars: [{ date: '2026-07-17', close: 71000 }] });
  });

  it('filters out Korean rows with non-finite close (e.g. null on non-trading gap days)', async () => {
    vi.mocked(yahooFinance.chart).mockResolvedValue({
      quotes: [
        { date: new Date('2026-07-16T00:00:00.000Z'), close: 71000 },
        { date: new Date('2026-07-17T00:00:00.000Z'), close: null },
        { date: new Date('2026-07-18T00:00:00.000Z'), close: 72000 },
      ],
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-16', close: 71000 },
        { date: '2026-07-18', close: 72000 },
      ],
    });
  });

  it('returns 502 when yahoo-finance2 throws for a Korean symbol', async () => {
    vi.mocked(yahooFinance.chart).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to FMP and maps price to close', async () => {
    mockFmpHistoryOk([
      { symbol: 'JOBY', date: '2026-07-18', price: 7.39 },
      { symbol: 'JOBY', date: '2026-07-17', price: 7.1 },
    ]);
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-17', close: 7.1 },
        { date: '2026-07-18', close: 7.39 },
      ],
    });
  });

  it('returns 502 when the FMP lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
