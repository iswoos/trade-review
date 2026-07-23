// src/lib/movingAverage.test.ts
import { describe, it, expect } from 'vitest';
import { simpleMovingAverage } from './movingAverage';

describe('simpleMovingAverage', () => {
  it('returns null until enough values exist for the window', () => {
    const result = simpleMovingAverage([1, 2, 3], 3);
    expect(result).toEqual([null, null, 2]);
  });

  it('computes a rolling average once the window is full', () => {
    const result = simpleMovingAverage([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([null, 1.5, 2.5, 3.5, 4.5]);
  });
});
