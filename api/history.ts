import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 1);
    const result = await yahooFinance.chart(symbol, { period1, interval: '1d' });
    const bars = result.quotes.map((q: any) => ({
      date: (q.date as Date).toISOString().slice(0, 10),
      close: q.close,
    }));
    res.status(200).json({ bars });
  } catch {
    res.status(502).json({ error: 'History lookup failed' });
  }
}
