import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './search';

vi.mock('yahoo-finance2', () => ({
  default: {
    search: vi.fn(),
  },
}));

import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.mocked(yahooFinance.search).mockReset();
});

describe('GET /api/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps yahoo-finance2 search results to {symbol, name, exchange}', async () => {
    vi.mocked(yahooFinance.search).mockResolvedValue({
      quotes: [{ symbol: 'JOBY', shortname: 'Joby Aviation', exchange: 'NYQ' }],
    } as any);

    const res = mockRes();
    await handler({ query: { q: 'joby' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: 'JOBY', name: 'Joby Aviation', exchange: 'NYQ' }],
    });
  });

  it('returns 502 when the upstream lookup throws', async () => {
    vi.mocked(yahooFinance.search).mockRejectedValue(new Error('upstream down'));
    const res = mockRes();
    await handler({ query: { q: 'joby' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
