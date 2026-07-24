import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { isKoreanSymbol, fmpHistory } from './_lib/fmp.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 1);
      const result = await yahooFinance.chart(symbol, { period1, interval: '1d' });
      const bars = result.quotes
        .filter((q: any) => Number.isFinite(q.close))
        .map((q: any) => ({
          date: (q.date as Date).toISOString().slice(0, 10),
          close: q.close,
        }));
      res.status(200).json({ bars });
      return;
    }
    const rows = await fmpHistory(symbol);
    res.status(200).json({ bars: rows.map((r) => ({ date: r.date, close: r.price })) });
  } catch {
    res.status(502).json({ error: 'History lookup failed' });
  }
}
