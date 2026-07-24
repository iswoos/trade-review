import { useState } from 'react';
import { searchSymbols, type SymbolResult } from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

interface TickerSearchProps {
  positions: PositionListItem[];
  onSelectTicker: (ticker: string, name: string) => void;
}

export function TickerSearch({ positions, onSelectTicker }: TickerSearchProps) {
  const [query, setQuery] = useState('');
  const [apiResults, setApiResults] = useState<SymbolResult[]>([]);

  async function handleChange(next: string) {
    setQuery(next);
    setApiResults(next.trim() ? await searchSymbols(next) : []);
  }

  const trimmed = query.trim().toLowerCase();
  const matchedPositions = trimmed
    ? positions.filter((p) => p.ticker.toLowerCase().includes(trimmed) || p.name.toLowerCase().includes(trimmed))
    : [];

  return (
    <div>
      <input
        aria-label="종목 검색"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="종목명 또는 티커 검색"
      />
      {trimmed && (
        <>
          {matchedPositions.length > 0 && (
            <ul aria-label="내 포지션 검색 결과">
              {matchedPositions.map((p) => (
                <li key={p.ticker}>
                  <button type="button" onClick={() => onSelectTicker(p.ticker, p.name)}>
                    {p.name} ({p.ticker})
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul aria-label="신규 검색 결과">
            {apiResults.map((r) => (
              <li key={r.symbol}>
                <button type="button" onClick={() => onSelectTicker(r.symbol, r.name)}>
                  {r.name} ({r.symbol})
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
