import { describe, it, expect } from 'vitest';
import { isKoreanSymbol } from './marketSymbol';

describe('isKoreanSymbol', () => {
  it('returns true for .KS suffix', () => {
    expect(isKoreanSymbol('005930.KS')).toBe(true);
  });

  it('returns true for .KQ suffix', () => {
    expect(isKoreanSymbol('123456.KQ')).toBe(true);
  });

  it('returns false for US symbols', () => {
    expect(isKoreanSymbol('AAPL')).toBe(false);
  });
});
