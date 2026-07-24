import type { VercelRequest, VercelResponse } from '@vercel/node';
import krxListingData from '../src/data/krx-listing.json';
import { searchKrxListing } from './_lib/krxListing.js';
import { twelveDataSearch } from './_lib/twelveData.js';

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query.q;
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  const krResults = searchKrxListing(krxListingData as { symbol: string; name: string }[], query);
  const [usOutcome] = await Promise.allSettled([twelveDataSearch(query)]);

  const seen = new Set<string>();
  const symbols: SymbolResult[] = [];
  for (const item of krResults) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    symbols.push(item);
  }
  if (usOutcome.status === 'fulfilled') {
    for (const item of usOutcome.value) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      symbols.push(item);
    }
  }
  res.status(200).json({ symbols });
}
