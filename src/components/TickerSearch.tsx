import { useEffect, useRef, useState } from 'react';
import { searchSymbols, type SymbolResult } from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

interface TickerSearchProps {
  positions: PositionListItem[];
  onSelectTicker: (ticker: string, name: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export function TickerSearch({ positions, onSelectTicker }: TickerSearchProps) {
  const [query, setQuery] = useState('');
  const [apiResults, setApiResults] = useState<SymbolResult[]>([]);
  const latestQueryRef = useRef('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function runSearch(next: string) {
    const results = await searchSymbols(next);
    if (latestQueryRef.current === next) {
      setApiResults(results);
    }
  }

  function handleChange(next: string) {
    setQuery(next);
    latestQueryRef.current = next;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (!next.trim()) {
      setApiResults([]);
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      void runSearch(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearSearch() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setQuery('');
    setApiResults([]);
    latestQueryRef.current = '';
  }

  function selectTicker(ticker: string, name: string) {
    clearSearch();
    onSelectTicker(ticker, name);
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        clearSearch();
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const trimmed = query.trim().toLowerCase();
  const matchedPositions = trimmed
    ? positions.filter((p) => p.ticker.toLowerCase().includes(trimmed) || p.name.toLowerCase().includes(trimmed))
    : [];

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          aria-label="종목 검색"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="종목명 또는 티커 검색"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 pr-9 text-sm text-zinc-900 shadow-sm shadow-zinc-900/5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          >
            ✕
          </button>
        )}
      </div>
      {trimmed && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {matchedPositions.length > 0 && (
            <ul aria-label="내 포지션 검색 결과" className="flex flex-col gap-1">
              {matchedPositions.map((p) => (
                <li key={p.ticker}>
                  <button
                    type="button"
                    onClick={() => selectTicker(p.ticker, p.name)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {p.name} ({p.ticker})
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul aria-label="신규 검색 결과" className="flex flex-col gap-1">
            {apiResults.map((r) => (
              <li key={r.symbol}>
                <button
                  type="button"
                  onClick={() => selectTicker(r.symbol, r.name)}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {r.name} ({r.symbol})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
