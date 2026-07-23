import { describe, it, expect } from 'vitest';
import { resolveQuantity } from './quantity';

describe('resolveQuantity', () => {
  it('returns quantityValue as-is when quantityType is "shares"', () => {
    const quantity = resolveQuantity({
      quantityType: 'shares',
      quantityValue: 10,
      price: 14.97,
      tickerCurrency: 'USD',
      fxRateAtTrade: null,
    });
    expect(quantity).toBe(10);
  });

  it('divides amount by price when tickerCurrency is KRW (no FX needed)', () => {
    const quantity = resolveQuantity({
      quantityType: 'amount',
      quantityValue: 1_000_000,
      price: 50_000,
      tickerCurrency: 'KRW',
      fxRateAtTrade: null,
    });
    expect(quantity).toBe(20);
  });

  it('converts a KRW amount into shares of a non-KRW ticker using fxRateAtTrade', () => {
    const quantity = resolveQuantity({
      quantityType: 'amount',
      quantityValue: 1_250_000,
      price: 17.6,
      tickerCurrency: 'USD',
      fxRateAtTrade: 1400,
    });
    expect(quantity).toBeCloseTo(1_250_000 / (17.6 * 1400), 6);
  });

  it('throws when converting a non-KRW ticker amount without fxRateAtTrade', () => {
    expect(() =>
      resolveQuantity({
        quantityType: 'amount',
        quantityValue: 1_250_000,
        price: 17.6,
        tickerCurrency: 'USD',
        fxRateAtTrade: null,
      })
    ).toThrow(/fxRateAtTrade/);
  });
});
