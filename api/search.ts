import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { fmpSearch } from './_lib/fmp.js';

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
}

async function searchYahoo(query: string): Promise<SymbolResult[]> {
  const result = await yahooFinance.search(query);
  return result.quotes
    .filter((q: any) => typeof q.symbol === 'string')
    .map((q: any) => ({
      symbol: q.symbol,
      name: q.shortname ?? q.symbol,
      exchange: q.exchange ?? '',
    }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query.q;
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  const [fmpOutcome, yahooOutcome] = await Promise.allSettled([fmpSearch(query), searchYahoo(query)]);

  if (fmpOutcome.status === 'rejected' && yahooOutcome.status === 'rejected') {
    res.status(502).json({ error: 'Symbol search failed' });
    return;
  }

  const seen = new Set<string>();
  const symbols: SymbolResult[] = [];
  for (const outcome of [fmpOutcome, yahooOutcome]) {
    if (outcome.status !== 'fulfilled') continue;
    for (const item of outcome.value) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      symbols.push(item);
    }
  }
  res.status(200).json({ symbols });
}
