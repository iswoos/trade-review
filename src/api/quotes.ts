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

export async function fetchQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchHistory(symbol: string): Promise<HistoryBar[]> {
  try {
    const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.bars;
  } catch {
    return [];
  }
}
