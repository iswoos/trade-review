import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './fxrate';

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

describe('GET /api/fxrate', () => {
  it('returns 400 when date is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns the fetched rate on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ values: [{ datetime: '2026-07-18', open: '1350', high: '1360', low: '1345', close: '1352.5' }] }),
      })
    );
    const res = mockRes();
    await handler({ query: { date: '2026-07-18' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ rate: 1352.5 });
  });

  it('returns 502 when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ query: { date: '2026-07-18' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
