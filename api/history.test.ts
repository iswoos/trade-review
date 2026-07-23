import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './history';

vi.mock('yahoo-finance2', () => ({ default: { chart: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.mocked(yahooFinance.chart).mockReset();
});

describe('GET /api/history', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps chart quotes to {date, close} bars', async () => {
    vi.mocked(yahooFinance.chart).mockResolvedValue({
      quotes: [{ date: new Date('2026-07-17T00:00:00.000Z'), close: 7.39 }],
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ bars: [{ date: '2026-07-17', close: 7.39 }] });
  });

  it('returns 502 on upstream failure', async () => {
    vi.mocked(yahooFinance.chart).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
