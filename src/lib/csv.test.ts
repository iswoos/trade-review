import { describe, it, expect } from 'vitest';
import { tradesToCsv, csvToTrades } from './csv';
import type { Trade } from '../types';

const sample: Trade = {
  id: 'abc-123',
  ticker: 'JOBY',
  market: 'US',
  name: '조비, 항공',
  currency: 'USD',
  datetime: '2025-07-10T00:00:00.000Z',
  datetimeUnknown: false,
  side: 'buy',
  price: 11.36,
  quantityType: 'shares',
  quantityValue: 100,
  quantity: 100,
  fxRateAtTrade: null,
  rationaleTagIds: ['tag-1', 'tag-2'],
  conviction: 4,
  memo: '관세 여파 없는 것으로 판단, "안전"하다고 봄',
  attachment: null,
  recordedAt: '2025-07-10T00:05:00.000Z',
};

describe('CSV round-trip', () => {
  it('reproduces the original trade after export then import, including commas and quotes in text fields', () => {
    const csv = tradesToCsv([sample]);
    const [restored] = csvToTrades(csv);
    expect(restored).toEqual(sample);
  });

  it('round-trips a trade with null optional fields', () => {
    const nullish: Trade = { ...sample, fxRateAtTrade: null, conviction: null, attachment: null, rationaleTagIds: [] };
    const csv = tradesToCsv([nullish]);
    const [restored] = csvToTrades(csv);
    expect(restored).toEqual(nullish);
  });

  it('handles literal newlines inside quoted memo fields', () => {
    const withNewline: Trade = { ...sample, memo: '첫째 줄\n둘째 줄' };
    const csv = tradesToCsv([withNewline]);
    const [restored] = csvToTrades(csv);
    expect(restored).toEqual(withNewline);
  });
});
