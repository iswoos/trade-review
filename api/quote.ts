import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isKoreanSymbol } from './_lib/marketSymbol.js';
import { dataGoKrQuote } from './_lib/dataGoKr.js';
import { twelveDataQuote } from './_lib/twelveData.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const quote = await dataGoKrQuote(symbol);
      res.status(200).json({ symbol: quote.symbol, price: quote.price, currency: 'KRW', dailyChangePercent: quote.dailyChangePercent });
      return;
    }
    const quote = await twelveDataQuote(symbol);
    res.status(200).json({ symbol: quote.symbol, price: quote.price, currency: 'USD', dailyChangePercent: quote.dailyChangePercent });
  } catch {
    res.status(502).json({ error: 'Quote lookup failed' });
  }
}
