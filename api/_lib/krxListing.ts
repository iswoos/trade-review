export interface KrxListingEntry {
  symbol: string;
  name: string;
}

export interface KrxSearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

function exchangeForSymbol(symbol: string): string {
  if (/\.ks$/i.test(symbol)) return 'KOSPI';
  if (/\.kq$/i.test(symbol)) return 'KOSDAQ';
  return '';
}

export function searchKrxListing(listing: KrxListingEntry[], query: string): KrxSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return listing
    .filter((item) => item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q))
    .map((item) => ({ symbol: item.symbol, name: item.name, exchange: exchangeForSymbol(item.symbol) }));
}
