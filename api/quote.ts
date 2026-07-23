import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    const quote = await yahooFinance.quote(symbol);
    res.status(200).json({
      symbol: quote.symbol,
      price: quote.regularMarketPrice ?? null,
      currency: quote.currency ?? null,
    });
  } catch {
    res.status(502).json({ error: 'Quote lookup failed' });
  }
}
