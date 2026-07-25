export type Side = 'buy' | 'sell';
export type QuantityType = 'shares' | 'amount';
export type Currency = 'USD' | 'KRW';

export interface Tag {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string; // ISO datetime string
  order: number; // For maintaining insertion order
}

export interface Trade {
  id: string;
  ticker: string;
  market: 'US' | 'KR';
  name: string;
  currency: Currency;
  /** ISO datetime string, or null when unknown/scheduled (datetimeUnknown will be true). */
  datetime: string | null;
  datetimeUnknown: boolean;
  side: Side;
  /** Fill price, in `currency`. */
  price: number;
  quantityType: QuantityType;
  /** Raw user input: share count if quantityType is 'shares', KRW amount if 'amount'. */
  quantityValue: number;
  /** Resolved share count, computed at save time via resolveQuantity(). */
  quantity: number;
  /** KRW-per-unit-of-`currency` rate at trade time. Required only when quantityType is 'amount' and currency !== 'KRW'. */
  fxRateAtTrade: number | null;
  rationaleTagIds: string[];
  conviction: number | null;
  memo: string;
  attachment: string | null;
  /** Auto-stamped when the trade is saved locally. Never shown in the UI. */
  recordedAt: string;
}

export interface Position {
  ticker: string;
  name: string;
  avgCost: number;
  totalQuantity: number;
  avgCostHistory: { at: string; avgCost: number }[];
  realizedPl: number;
  lastTradeRecordedAt: string;
}
