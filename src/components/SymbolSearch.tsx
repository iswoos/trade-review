import { useState } from 'react';
import { searchSymbols, type SymbolResult } from '../api/quotes';

interface SymbolSearchProps {
  onSelect: (symbol: SymbolResult) => void;
}

export function SymbolSearch({ onSelect }: SymbolSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SymbolResult[]>([]);

  async function handleChange(next: string) {
    setQuery(next);
    setResults(await searchSymbols(next));
  }

  return (
    <div>
      <input
        aria-label="종목 검색"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="티커 또는 종목명"
      />
      <ul>
        {results.map((result) => (
          <li key={result.symbol}>
            <button type="button" onClick={() => onSelect(result)}>
              {result.name} ({result.symbol})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
