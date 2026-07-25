export interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
}

export interface QuoteResult {
  price: number | null;
  currency: 'USD' | 'KRW' | null;
}

export interface HistoryBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function searchSymbols(query: string): Promise<SymbolResult[]> {
  if (query.trim().length === 0) return [];
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.symbols;
  } catch {
    return [];
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const quoteCache = new Map<string, CacheEntry<QuoteResult>>();
const historyCache = new Map<string, CacheEntry<HistoryBar[]>>();

export async function fetchQuote(symbol: string): Promise<QuoteResult | null> {
  const cached = quoteCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const value = (await res.json()) as QuoteResult;
    quoteCache.set(symbol, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

export async function fetchHistory(symbol: string): Promise<HistoryBar[]> {
  const cached = historyCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const value = data.bars as HistoryBar[];
    historyCache.set(symbol, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return [];
  }
}
