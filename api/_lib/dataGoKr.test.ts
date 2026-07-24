/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dataGoKrQuote, dataGoKrHistory } from './dataGoKr';

beforeEach(() => {
  process.env.DATA_GO_KR_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(items: { basDt: string; srtnCd: string; clpr: string }[]) {
  return {
    ok: true,
    json: async () => ({
      response: {
        header: { resultCode: '00', resultMsg: 'OK' },
        body: {
          items: items.length === 0 ? '' : { item: items },
          numOfRows: items.length,
          pageNo: 1,
          totalCount: items.length,
        },
      },
    }),
  };
}

describe('dataGoKrQuote', () => {
  it('returns the requested symbol and latest close price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse([{ basDt: '20260723', srtnCd: '005930', clpr: '71000' }]))
    );
    const quote = await dataGoKrQuote('005930.KS');
    expect(quote).toEqual({ symbol: '005930.KS', price: 71000 });
  });

  it('requests getStockPriceInfo with the KR suffix stripped', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse([{ basDt: '20260723', srtnCd: '005930', clpr: '71000' }]));
    vi.stubGlobal('fetch', fetchMock);
    await dataGoKrQuote('005930.KS');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/GetStockSecuritiesInfoService/getStockPriceInfo?');
    expect(url).toContain('likeSrtnCd=005930');
  });

  it('throws when data.go.kr returns no rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([])));
    await expect(dataGoKrQuote('005930.KS')).rejects.toThrow();
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(dataGoKrQuote('005930.KS')).rejects.toThrow();
  });

  it('throws when the response envelope reports a non-success resultCode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: { header: { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } },
        }),
      })
    );
    await expect(dataGoKrQuote('005930.KS')).rejects.toThrow();
  });
});

describe('dataGoKrHistory', () => {
  it('maps rows to {date, price} sorted oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse([
          { basDt: '20260718', srtnCd: '005930', clpr: '72000' },
          { basDt: '20260717', srtnCd: '005930', clpr: '71000' },
        ])
      )
    );
    const bars = await dataGoKrHistory('005930.KS');
    expect(bars).toEqual([
      { date: '2026-07-17', price: 71000 },
      { date: '2026-07-18', price: 72000 },
    ]);
  });

  it('requests a beginBasDt/endBasDt range with the KR suffix stripped', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await dataGoKrHistory('005930.KS');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('likeSrtnCd=005930');
    expect(url).toContain('beginBasDt=');
    expect(url).toContain('endBasDt=');
  });
});
