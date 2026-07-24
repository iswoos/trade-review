import type { VercelRequest, VercelResponse } from '@vercel/node';
import krxListingData from '../src/data/krx-listing.json';
import { searchKrxListing } from './_lib/krxListing.js';
import { twelveDataSearch } from './_lib/twelveData.js';

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
}

// Twelve Data has no Korean-language company names to match, so a query
// containing Hangul can only ever match the KR bundled listing. Skipping the
// Twelve Data call for these queries saves a call against its free-tier rate
// limit (8/min, 800/day) on every search that's obviously not a US lookup.
function containsHangul(text: string): boolean {
  return /[ㄱ-ㆎ가-힣]/.test(text);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query.q;
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  const krResults = searchKrxListing(krxListingData as { symbol: string; name: string }[], query);

  const seen = new Set<string>();
  const symbols: SymbolResult[] = [];
  for (const item of krResults) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    symbols.push(item);
  }

  if (!containsHangul(query)) {
    const [usOutcome] = await Promise.allSettled([twelveDataSearch(query)]);
    if (usOutcome.status === 'fulfilled') {
      for (const item of usOutcome.value) {
        if (seen.has(item.symbol)) continue;
        seen.add(item.symbol);
        symbols.push(item);
      }
    }
  }

  res.status(200).json({ symbols });
}
