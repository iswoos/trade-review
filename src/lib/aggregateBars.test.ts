import { describe, it, expect } from 'vitest';
import { aggregateBars } from './aggregateBars';

describe('aggregateBars', () => {
  it('returns the bars unchanged for period "day"', () => {
    const bars = [
      { date: '2026-07-17', open: 100, high: 105, low: 99, close: 102 },
      { date: '2026-07-20', open: 102, high: 108, low: 101, close: 106 },
    ];
    expect(aggregateBars(bars, 'day')).toEqual(bars);
  });

  it('groups into Monday-start weekly buckets, aggregating OHLC across the bucket', () => {
    const bars = [
      { date: '2026-07-13', open: 100, high: 105, low: 99, close: 102 }, // Mon, week 1
      { date: '2026-07-14', open: 102, high: 108, low: 101, close: 106 }, // Tue, week 1
      { date: '2026-07-17', open: 106, high: 110, low: 104, close: 107 }, // Fri, week 1 (Wed/Thu missing - holiday gap)
      { date: '2026-07-20', open: 107, high: 112, low: 106, close: 110 }, // Mon, week 2
    ];
    expect(aggregateBars(bars, 'week')).toEqual([
      { date: '2026-07-13', open: 100, high: 110, low: 99, close: 107 },
      { date: '2026-07-20', open: 107, high: 112, low: 106, close: 110 },
    ]);
  });

  it('groups into calendar-month buckets', () => {
    const bars = [
      { date: '2026-07-17', open: 100, high: 105, low: 99, close: 102 },
      { date: '2026-07-21', open: 102, high: 109, low: 101, close: 108 },
      { date: '2026-08-03', open: 108, high: 115, low: 107, close: 112 },
    ];
    expect(aggregateBars(bars, 'month')).toEqual([
      { date: '2026-07-17', open: 100, high: 109, low: 99, close: 108 },
      { date: '2026-08-03', open: 108, high: 115, low: 107, close: 112 },
    ]);
  });

  it('groups into calendar-year buckets', () => {
    const bars = [
      { date: '2026-12-31', open: 100, high: 103, low: 98, close: 101 },
      { date: '2027-01-02', open: 101, high: 106, low: 100, close: 104 },
    ];
    expect(aggregateBars(bars, 'year')).toEqual([
      { date: '2026-12-31', open: 100, high: 103, low: 98, close: 101 },
      { date: '2027-01-02', open: 101, high: 106, low: 100, close: 104 },
    ]);
  });

  it('returns [] for an empty input regardless of period', () => {
    expect(aggregateBars([], 'week')).toEqual([]);
  });
});
