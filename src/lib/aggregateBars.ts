import type { HistoryBar } from '../api/quotes';

export type AggregationPeriod = 'day' | 'week' | 'month' | 'year';

function bucketKey(date: string, period: AggregationPeriod): string {
  if (period === 'year') return date.slice(0, 4);
  if (period === 'month') return date.slice(0, 7);
  // week: Monday-start (Korean convention). getUTCDay(): 0=Sun..6=Sat;
  // convert to days-since-Monday (Mon=0 .. Sun=6) and step back to that Monday.
  const d = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

export function aggregateBars(bars: HistoryBar[], period: AggregationPeriod): HistoryBar[] {
  if (period === 'day') return bars;

  const buckets = new Map<string, HistoryBar[]>();
  for (const bar of bars) {
    const key = bucketKey(bar.date, period);
    const group = buckets.get(key);
    if (group) {
      group.push(bar);
    } else {
      buckets.set(key, [bar]);
    }
  }

  return [...buckets.values()].map((group) => ({
    date: group[0].date,
    open: group[0].open,
    close: group[group.length - 1].close,
    high: Math.max(...group.map((b) => b.high)),
    low: Math.min(...group.map((b) => b.low)),
  }));
}
