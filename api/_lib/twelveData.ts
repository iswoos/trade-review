interface TwelveDataQuoteResponse {
  symbol: string;
  close: string;
}

interface TwelveDataTimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

interface TwelveDataTimeSeriesResponse {
  values: TwelveDataTimeSeriesValue[];
}

interface TwelveDataSearchResult {
  symbol: string;
  instrument_name: string;
  exchange: string;
}

interface TwelveDataSearchResponse {
  data: TwelveDataSearchResult[];
}

interface TwelveDataErrorBody {
  status?: string;
  message?: string;
}

function twelveDataApiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY is not set');
  return key;
}

async function twelveDataFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ ...params, apikey: twelveDataApiKey() });
  const res = await fetch(`https://api.twelvedata.com/${path}?${search.toString()}`);
  if (!res.ok) throw new Error(`Twelve Data request failed: ${res.status}`);
  const data = await res.json();
  if ((data as TwelveDataErrorBody).status === 'error') {
    throw new Error(`Twelve Data error: ${(data as TwelveDataErrorBody).message ?? 'unknown'}`);
  }
  return data;
}

export async function twelveDataQuote(symbol: string): Promise<{ symbol: string; price: number }> {
  const data = (await twelveDataFetch('quote', { symbol })) as TwelveDataQuoteResponse;
  return { symbol: data.symbol, price: Number(data.close) };
}

export async function twelveDataHistory(
  symbol: string
): Promise<{ date: string; open: number; high: number; low: number; price: number }[]> {
  const data = (await twelveDataFetch('time_series', {
    symbol,
    interval: '1day',
    outputsize: '365',
  })) as TwelveDataTimeSeriesResponse;
  return [...data.values].reverse().map((v) => ({
    date: v.datetime,
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    price: Number(v.close),
  }));
}

export async function twelveDataSearch(
  query: string
): Promise<{ symbol: string; name: string; exchange: string }[]> {
  const data = (await twelveDataFetch('symbol_search', { symbol: query })) as TwelveDataSearchResponse;
  return data.data.map((r) => ({ symbol: r.symbol, name: r.instrument_name, exchange: r.exchange ?? '' }));
}
