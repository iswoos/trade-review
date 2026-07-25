import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isKoreanSymbol } from './_lib/marketSymbol.js';
import { dataGoKrHistory } from './_lib/dataGoKr.js';
import { twelveDataHistory } from './_lib/twelveData.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const rows = await dataGoKrHistory(symbol);
      res.status(200).json({
        bars: rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.price })),
      });
      return;
    }
    const rows = await twelveDataHistory(symbol);
    res.status(200).json({
      bars: rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.price })),
    });
  } catch {
    res.status(502).json({ error: 'History lookup failed' });
  }
}
