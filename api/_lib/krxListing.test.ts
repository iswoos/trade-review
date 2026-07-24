import { describe, it, expect } from 'vitest';
import { searchKrxListing } from './krxListing';

const listing = [
  { symbol: '005930.KS', name: '삼성전자' },
  { symbol: '035720.KQ', name: '카카오' },
];

describe('searchKrxListing', () => {
  it('matches by symbol substring, case-insensitive', () => {
    expect(searchKrxListing(listing, '5930')).toEqual([{ symbol: '005930.KS', name: '삼성전자', exchange: 'KOSPI' }]);
  });

  it('matches by name substring', () => {
    expect(searchKrxListing(listing, '카카오')).toEqual([
      { symbol: '035720.KQ', name: '카카오', exchange: 'KOSDAQ' },
    ]);
  });

  it('returns [] for an empty query', () => {
    expect(searchKrxListing(listing, '  ')).toEqual([]);
  });

  it('returns [] when nothing matches', () => {
    expect(searchKrxListing(listing, 'nomatch')).toEqual([]);
  });
});
