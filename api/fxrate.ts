import type { VercelRequest, VercelResponse } from '@vercel/node';
import { twelveDataFxRate } from './_lib/twelveData.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const date = req.query.date;
  if (typeof date !== 'string' || date.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "date"' });
    return;
  }
  try {
    const rate = await twelveDataFxRate(date);
    res.status(200).json({ rate });
  } catch {
    res.status(502).json({ error: 'FX rate lookup failed' });
  }
}
