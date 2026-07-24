interface FmpQuote {
  symbol: string;
  price: number;
}

interface FmpSearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface FmpHistoricalRow {
  symbol: string;
  date: string;
  price: number;
}

function fmpApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('FMP_API_KEY is not set');
  return key;
}

async function fmpFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ ...params, apikey: fmpApiKey() });
  const res = await fetch(`https://financialmodelingprep.com/stable/${path}?${search.toString()}`);
  if (!res.ok) throw new Error(`FMP request failed: ${res.status}`);
  return res.json();
}

export async function fmpQuote(symbol: string): Promise<FmpQuote> {
  const data = (await fmpFetch('quote', { symbol })) as FmpQuote[];
  if (!data[0]) throw new Error(`FMP quote returned no data for ${symbol}`);
  return { symbol: data[0].symbol, price: data[0].price };
}

export async function fmpSearch(query: string): Promise<FmpSearchResult[]> {
  const data = (await fmpFetch('search-name', { query })) as FmpSearchResult[];
  return data.map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange ?? '' }));
}

export async function fmpHistory(symbol: string): Promise<{ date: string; price: number }[]> {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  const data = (await fmpFetch('historical-price-eod/light', {
    symbol,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  })) as FmpHistoricalRow[];
  return [...data].reverse().map((r) => ({ date: r.date, price: r.price }));
}
