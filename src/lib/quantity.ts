import type { Currency, QuantityType } from '../types';

export interface ResolveQuantityInput {
  quantityType: QuantityType;
  quantityValue: number;
  price: number;
  tickerCurrency: Currency;
  fxRateAtTrade: number | null;
}

export function resolveQuantity(input: ResolveQuantityInput): number {
  if (input.quantityType === 'shares') {
    return input.quantityValue;
  }
  if (input.quantityType === 'amount_krw') {
    if (input.fxRateAtTrade == null) {
      throw new Error('fxRateAtTrade is required when quantityType is "amount_krw"');
    }
    return input.quantityValue / (input.price * input.fxRateAtTrade);
  }
  // input.quantityType === 'amount'
  if (input.tickerCurrency === 'KRW') {
    return input.quantityValue / input.price;
  }
  // USD currency with quantityType === 'amount' (User input in USD dollars)
  return input.quantityValue / input.price;
}
