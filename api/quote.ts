import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { isKoreanSymbol } from './_lib/marketSymbol.js';
import { fmpQuote } from './_lib/fmp.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const quote = await yahooFinance.quote(symbol);
      res.status(200).json({
        symbol: quote.symbol,
        price: quote.regularMarketPrice ?? null,
        currency: quote.currency ?? null,
      });
      return;
    }
    const quote = await fmpQuote(symbol);
    res.status(200).json({ symbol: quote.symbol, price: quote.price, currency: 'USD' });
  } catch {
    res.status(502).json({ error: 'Quote lookup failed' });
  }
}
