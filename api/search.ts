import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query.q;
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }
  try {
    const result = await yahooFinance.search(query);
    const symbols = result.quotes
      .filter((q: any) => typeof q.symbol === 'string')
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname ?? q.symbol,
        exchange: q.exchange ?? '',
      }));
    res.status(200).json({ symbols });
  } catch {
    res.status(502).json({ error: 'Symbol search failed' });
  }
}
