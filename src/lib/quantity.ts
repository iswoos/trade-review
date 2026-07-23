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
  if (input.tickerCurrency === 'KRW') {
    return input.quantityValue / input.price;
  }
  if (input.fxRateAtTrade == null) {
    throw new Error(
      'fxRateAtTrade is required when quantityType is "amount" and tickerCurrency is not KRW'
    );
  }
  return input.quantityValue / (input.price * input.fxRateAtTrade);
}
