# 미국 종목 FMP 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미국 종목(비 `.KS`/`.KQ`)의 시세 조회(`/api/quote`), 과거 시세(`/api/history`), 검색(`/api/search`)을 Financial Modeling Prep(FMP)으로 전환하고, 한국 종목은 기존 `yahoo-finance2` 경로를 그대로 유지한다.

**Architecture:** `api/_lib/fmp.ts`에 FMP 호출 헬퍼(`isKoreanSymbol`, `fmpQuote`, `fmpSearch`, `fmpHistory`)를 만들고, 기존 세 핸들러(`api/quote.ts`, `api/history.ts`, `api/search.ts`)에서 심볼이 한국 종목 패턴이면 기존 yahoo-finance2 경로, 아니면 FMP 경로를 타도록 분기한다. `search`만 예외로 두 소스를 병렬 호출(`Promise.allSettled`)해 결과를 합친다.

**Tech Stack:** TypeScript, Vercel serverless functions(`@vercel/node`), `yahoo-finance2`, `fetch`(Node 20 내장), Vitest.

## Global Constraints

- 프런트엔드 응답 스키마(`SymbolResult{symbol,name,exchange}`, `QuoteResult{price,currency}`, `HistoryBar{date,close}`)는 변경하지 않는다 — `src/api/quotes.ts`와 컴포넌트는 수정 불필요.
- 한국 종목(`.KS`/`.KQ`) 경로는 이번 작업에서 로직을 바꾸지 않는다(회복력 개선은 별도 작업).
- FMP API 키는 코드나 커밋에 절대 하드코딩하지 않는다 — `process.env.FMP_API_KEY`로만 접근.
- 신규/변경 테스트는 기존 컨벤션(`vi.mock('yahoo-finance2', ...)`, `mockRes()`, `vi.stubGlobal('fetch', ...)`)을 따른다.

---

### Task 1: FMP 클라이언트 헬퍼 (`api/_lib/fmp.ts`)

**Files:**
- Create: `api/_lib/fmp.ts`
- Test: `api/_lib/fmp.test.ts`

**Interfaces:**
- Produces: `isKoreanSymbol(symbol: string): boolean`, `fmpQuote(symbol: string): Promise<{symbol: string; price: number}>`, `fmpSearch(query: string): Promise<{symbol: string; name: string; exchange: string}[]>`, `fmpHistory(symbol: string): Promise<{date: string; price: number}[]>` (oldest → newest 순 정렬됨)

- [ ] **Step 1: 실패하는 테스트 작성**

`api/_lib/fmp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isKoreanSymbol, fmpQuote, fmpSearch, fmpHistory } from './fmp';

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

describe('FMP client', () => {
  beforeEach(() => {
    process.env.FMP_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fmpQuote returns the first result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ symbol: 'AAPL', price: 320.27 }],
      }),
    );
    const quote = await fmpQuote('AAPL');
    expect(quote).toEqual({ symbol: 'AAPL', price: 320.27 });
  });

  it('fmpQuote throws when FMP returns no data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    await expect(fmpQuote('AAPL')).rejects.toThrow();
  });

  it('fmpQuote throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fmpQuote('AAPL')).rejects.toThrow();
  });

  it('fmpSearch maps FMP fields to {symbol, name, exchange}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
      }),
    );
    const results = await fmpSearch('apple');
    expect(results).toEqual([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
  });

  it('fmpHistory reverses newest-first data to oldest-first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { symbol: 'AAPL', date: '2026-07-18', price: 7.39 },
          { symbol: 'AAPL', date: '2026-07-17', price: 7.1 },
        ],
      }),
    );
    const bars = await fmpHistory('AAPL');
    expect(bars).toEqual([
      { date: '2026-07-17', price: 7.1 },
      { date: '2026-07-18', price: 7.39 },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- api/_lib/fmp.test.ts`
Expected: FAIL — `Cannot find module './fmp'` (파일이 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

`api/_lib/fmp.ts`:

```ts
export function isKoreanSymbol(symbol: string): boolean {
  return /\.(ks|kq)$/i.test(symbol);
}

interface FmpQuote {
  symbol: string;
  price: number;
}

interface FmpSearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface FmpHistoricalRow {
  symbol: string;
  date: string;
  price: number;
}

function fmpApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('FMP_API_KEY is not set');
  return key;
}

async function fmpFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ ...params, apikey: fmpApiKey() });
  const res = await fetch(`https://financialmodelingprep.com/stable/${path}?${search.toString()}`);
  if (!res.ok) throw new Error(`FMP request failed: ${res.status}`);
  return res.json();
}

export async function fmpQuote(symbol: string): Promise<FmpQuote> {
  const data = (await fmpFetch('quote', { symbol })) as FmpQuote[];
  if (!data[0]) throw new Error(`FMP quote returned no data for ${symbol}`);
  return { symbol: data[0].symbol, price: data[0].price };
}

export async function fmpSearch(query: string): Promise<FmpSearchResult[]> {
  const data = (await fmpFetch('search-symbol', { query })) as FmpSearchResult[];
  return data.map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange ?? '' }));
}

export async function fmpHistory(symbol: string): Promise<{ date: string; price: number }[]> {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  const data = (await fmpFetch('historical-price-eod/light', {
    symbol,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  })) as FmpHistoricalRow[];
  return [...data].reverse().map((r) => ({ date: r.date, price: r.price }));
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- api/_lib/fmp.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add api/_lib/fmp.ts api/_lib/fmp.test.ts
git commit -m "feat: FMP 시세 API 클라이언트 헬퍼 추가"
```

---

### Task 2: `/api/quote`에 미국 종목 FMP 라우팅 추가

**Files:**
- Modify: `api/quote.ts`
- Modify: `api/quote.test.ts`

**Interfaces:**
- Consumes: `isKoreanSymbol(symbol: string): boolean`, `fmpQuote(symbol: string): Promise<{symbol: string; price: number}>` (Task 1)

- [ ] **Step 1: 기존 테스트를 한국 심볼 기준으로 수정하고, FMP 분기 테스트 추가 (실패하는 상태로 작성)**

`api/quote.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './quote';

vi.mock('yahoo-finance2', () => ({ default: { quote: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockFmpQuoteOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

beforeEach(() => {
  vi.mocked(yahooFinance.quote).mockReset();
  process.env.FMP_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/quote', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('routes Korean symbols (.KS) to yahoo-finance2', async () => {
    vi.mocked(yahooFinance.quote).mockResolvedValue({
      symbol: '005930.KS',
      regularMarketPrice: 71000,
      currency: 'KRW',
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: '005930.KS', price: 71000, currency: 'KRW' });
  });

  it('returns 502 when yahoo-finance2 throws for a Korean symbol', async () => {
    vi.mocked(yahooFinance.quote).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to FMP and reports currency as USD', async () => {
    mockFmpQuoteOk([{ symbol: 'AAPL', price: 320.27 }]);
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: 'AAPL', price: 320.27, currency: 'USD' });
  });

  it('returns 502 when the FMP lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- api/quote.test.ts`
Expected: FAIL — `.KS`가 아닌 심볼도 여전히 yahoo-finance2로 가는 기존 구현이라 "routes non-Korean symbols to FMP" 케이스가 실패함

- [ ] **Step 3: 구현 수정**

`api/quote.ts` 전체를 다음으로 교체:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { isKoreanSymbol, fmpQuote } from './_lib/fmp';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const quote = await yahooFinance.quote(symbol);
      res.status(200).json({
        symbol: quote.symbol,
        price: quote.regularMarketPrice ?? null,
        currency: quote.currency ?? null,
      });
      return;
    }
    const quote = await fmpQuote(symbol);
    res.status(200).json({ symbol: quote.symbol, price: quote.price, currency: 'USD' });
  } catch {
    res.status(502).json({ error: 'Quote lookup failed' });
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- api/quote.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add api/quote.ts api/quote.test.ts
git commit -m "feat: 미국 종목 시세 조회를 FMP로 라우팅"
```

---

### Task 3: `/api/history`에 미국 종목 FMP 라우팅 추가

**Files:**
- Modify: `api/history.ts`
- Modify: `api/history.test.ts`

**Interfaces:**
- Consumes: `isKoreanSymbol(symbol: string): boolean`, `fmpHistory(symbol: string): Promise<{date: string; price: number}[]>` (Task 1)

- [ ] **Step 1: 기존 테스트를 한국 심볼 기준으로 수정하고, FMP 분기 테스트 추가 (실패하는 상태로 작성)**

`api/history.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './history';

vi.mock('yahoo-finance2', () => ({ default: { chart: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockFmpHistoryOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

beforeEach(() => {
  vi.mocked(yahooFinance.chart).mockReset();
  process.env.FMP_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/history', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('routes Korean symbols (.KS) to yahoo-finance2 and maps chart quotes to {date, close} bars', async () => {
    vi.mocked(yahooFinance.chart).mockResolvedValue({
      quotes: [{ date: new Date('2026-07-17T00:00:00.000Z'), close: 71000 }],
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ bars: [{ date: '2026-07-17', close: 71000 }] });
  });

  it('filters out Korean rows with non-finite close (e.g. null on non-trading gap days)', async () => {
    vi.mocked(yahooFinance.chart).mockResolvedValue({
      quotes: [
        { date: new Date('2026-07-16T00:00:00.000Z'), close: 71000 },
        { date: new Date('2026-07-17T00:00:00.000Z'), close: null },
        { date: new Date('2026-07-18T00:00:00.000Z'), close: 72000 },
      ],
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-16', close: 71000 },
        { date: '2026-07-18', close: 72000 },
      ],
    });
  });

  it('returns 502 when yahoo-finance2 throws for a Korean symbol', async () => {
    vi.mocked(yahooFinance.chart).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to FMP and maps price to close', async () => {
    mockFmpHistoryOk([
      { symbol: 'JOBY', date: '2026-07-17', price: 7.1 },
      { symbol: 'JOBY', date: '2026-07-18', price: 7.39 },
    ]);
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-17', close: 7.1 },
        { date: '2026-07-18', close: 7.39 },
      ],
    });
  });

  it('returns 502 when the FMP lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- api/history.test.ts`
Expected: FAIL — "routes non-Korean symbols to FMP" 케이스가 실패함(기존 구현은 항상 yahoo-finance2 사용)

- [ ] **Step 3: 구현 수정**

`api/history.ts` 전체를 다음으로 교체:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { isKoreanSymbol, fmpHistory } from './_lib/fmp';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 1);
      const result = await yahooFinance.chart(symbol, { period1, interval: '1d' });
      const bars = result.quotes
        .filter((q: any) => Number.isFinite(q.close))
        .map((q: any) => ({
          date: (q.date as Date).toISOString().slice(0, 10),
          close: q.close,
        }));
      res.status(200).json({ bars });
      return;
    }
    const rows = await fmpHistory(symbol);
    res.status(200).json({ bars: rows.map((r) => ({ date: r.date, close: r.price })) });
  } catch {
    res.status(502).json({ error: 'History lookup failed' });
  }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- api/history.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add api/history.ts api/history.test.ts
git commit -m "feat: 미국 종목 과거 시세 조회를 FMP로 라우팅"
```

---

### Task 4: `/api/search`를 FMP + yahoo-finance2 병렬 조회로 전환

**Files:**
- Modify: `api/search.ts`
- Modify: `api/search.test.ts`

**Interfaces:**
- Consumes: `fmpSearch(query: string): Promise<{symbol: string; name: string; exchange: string}[]>` (Task 1)

- [ ] **Step 1: 실패하는 테스트 작성**

`api/search.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './search';

vi.mock('yahoo-finance2', () => ({
  default: { search: vi.fn() },
}));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockFmpSearchOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

function mockFmpSearchFail() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
}

beforeEach(() => {
  vi.mocked(yahooFinance.search).mockReset();
  process.env.FMP_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('merges results from FMP and yahoo-finance2, deduped by symbol (FMP wins on collision)', async () => {
    mockFmpSearchOk([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
    vi.mocked(yahooFinance.search).mockResolvedValue({
      quotes: [{ symbol: 'AAPL', shortname: 'Apple Inc', exchange: 'NMS' }],
    } as any);

    const res = mockRes();
    await handler({ query: { q: 'apple' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
    });
  });

  it('returns yahoo-finance2 results when FMP fails', async () => {
    mockFmpSearchFail();
    vi.mocked(yahooFinance.search).mockResolvedValue({
      quotes: [{ symbol: '005930.KS', shortname: 'Samsung Electronics', exchange: 'KSC' }],
    } as any);

    const res = mockRes();
    await handler({ query: { q: '삼성' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: '005930.KS', name: 'Samsung Electronics', exchange: 'KSC' }],
    });
  });

  it('returns FMP results when yahoo-finance2 fails', async () => {
    mockFmpSearchOk([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
    vi.mocked(yahooFinance.search).mockRejectedValue(new Error('upstream down'));

    const res = mockRes();
    await handler({ query: { q: 'apple' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }],
    });
  });

  it('returns 502 when both sources fail', async () => {
    mockFmpSearchFail();
    vi.mocked(yahooFinance.search).mockRejectedValue(new Error('upstream down'));

    const res = mockRes();
    await handler({ query: { q: 'apple' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- api/search.test.ts`
Expected: FAIL — 현재 구현은 FMP를 호출하지 않고, 실패 시 부분 결과 반환도 하지 않음

- [ ] **Step 3: 구현 수정**

`api/search.ts` 전체를 다음으로 교체:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';
import { fmpSearch } from './_lib/fmp';

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
}

async function searchYahoo(query: string): Promise<SymbolResult[]> {
  const result = await yahooFinance.search(query);
  return result.quotes
    .filter((q: any) => typeof q.symbol === 'string')
    .map((q: any) => ({
      symbol: q.symbol,
      name: q.shortname ?? q.symbol,
      exchange: q.exchange ?? '',
    }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query.q;
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  const [fmpOutcome, yahooOutcome] = await Promise.allSettled([fmpSearch(query), searchYahoo(query)]);

  if (fmpOutcome.status === 'rejected' && yahooOutcome.status === 'rejected') {
    res.status(502).json({ error: 'Symbol search failed' });
    return;
  }

  const seen = new Set<string>();
  const symbols: SymbolResult[] = [];
  for (const outcome of [fmpOutcome, yahooOutcome]) {
    if (outcome.status !== 'fulfilled') continue;
    for (const item of outcome.value) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      symbols.push(item);
    }
  }
  res.status(200).json({ symbols });
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test -- api/search.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add api/search.ts api/search.test.ts
git commit -m "feat: 종목 검색을 FMP+yahoo-finance2 병렬 조회로 전환 (부분 실패 허용)"
```

---

### Task 5: FMP_API_KEY 시크릿 설정 + ADR-0009 문서화

**Files:**
- Modify: `.env.local` (git에 커밋되지 않음 — `.gitignore`의 `.env*` 규칙으로 이미 제외됨)
- Create: `docs/adr/0009-fmp-us-price-source.md`

**Interfaces:**
- (없음 — 문서/환경설정 작업)

- [ ] **Step 1: 로컬 `.env.local`에 FMP_API_KEY 추가**

`/Users/iseung-u/Documents/stock_support/src/main/resources/application.yml`의 `financialmodelingprep.api-key` 값을 그대로 복사해서 Trade-Review 프로젝트의 `.env.local`에 추가:

```
FMP_API_KEY=<stock_support의 financialmodelingprep.api-key 값>
```

주의: 이 값을 plan 문서, 커밋 메시지, 코드 어디에도 하드코딩하지 말 것 — `.env.local`에만 존재해야 한다.

- [ ] **Step 2: `.env.local`이 git에 잡히지 않는지 확인**

Run: `git status --short`
Expected: `.env.local`이 목록에 나타나지 않음 (untracked/ignored 상태)

- [ ] **Step 3: Vercel 프로젝트 환경변수에 등록**

이미 `.vercel/project.json`으로 프로젝트가 연결되어 있음. 다음 명령으로 production/preview/development 세 환경 모두에 등록(각 실행 시 값 입력 프롬프트가 뜨면 Step 1과 동일한 값 입력):

```bash
vercel env add FMP_API_KEY production
vercel env add FMP_API_KEY preview
vercel env add FMP_API_KEY development
```

- [ ] **Step 4: ADR-0009 작성**

`docs/adr/0009-fmp-us-price-source.md`:

```markdown
# 미국 종목 시세는 FMP, 한국 종목은 yahoo-finance2를 유지하는 하이브리드 구성

프로덕션에서 `/api/quote`, `/api/search`가 502를 반환하는 문제를 조사한 결과, 근본 원인은 우리 코드가 아니라 Yahoo Finance 쪽의 rate limit(HTTP 429 "Too Many Requests")이었다. 미국 종목(`AAPL`)과 한국 종목(`005930.KS`) 모두, quote/search 양쪽 모두 동일하게 실패해 입력값과 무관한 전면 장애임을 직접 재현으로 확인했다. 대체 무료 API를 조사했으나(Alpha Vantage 일 25회, Twelve Data KRX 유료 전용, iTick/Infoway는 공식 문서로 검증 안 됨, Stooq는 JS proof-of-work 챌린지로 서버 호출 자체가 막힘, 한국투자증권 KIS Developers는 증권 계좌 필요) 계좌 연동 없이 검증 가능한 대안이 없었다.

이후 별도 개인 프로젝트(`stock_support`)에서 이미 사용 중인 Financial Modeling Prep(FMP) API 키로 직접 호출 테스트한 결과, 신규 `/stable/*` 엔드포인트(`quote`, `search-symbol`, `historical-price-eod/light`)가 미국 종목에 대해 정상 동작함을 확인했다. 단, FMP·Finnhub 모두 free tier에서 한국 종목(`.KS`/`.KQ`) quote는 접근이 막혀 있다(직접 호출로 403 상당 에러 확인). 이 때문에 두 시장을 한 번에 커버하는 무료 단일 소스는 없다고 결론짓고, 심볼이 `.KS`/`.KQ`로 끝나면 기존 yahoo-finance2 경로, 그 외(미국)는 FMP 경로로 나누는 하이브리드 구성을 택했다. 검색만 예외로 두 소스를 병렬 호출해 결과를 합치는데, 어느 한쪽이 지금의 Yahoo처럼 완전히 막혀도 다른 쪽 결과로 서비스가 계속되게 하기 위함이다.

한국 종목은 여전히 yahoo-finance2에 의존하므로 ADR-0005의 리스크("비공식 API라 Yahoo가 구조를 바꾸면 깨질 수 있다")가 그대로 남아있다. 이 리스크에 대한 회복력 개선(429 재시도, 실제 에러 로깅)은 이번 작업 범위에 포함하지 않고 별도로 다룬다.
```

- [ ] **Step 5: 커밋**

```bash
git add docs/adr/0009-fmp-us-price-source.md
git commit -m "docs: ADR-0009 미국 종목 FMP / 한국 종목 yahoo-finance2 하이브리드 구성 기록"
```

(`.env.local`과 Vercel 환경변수는 git과 무관하므로 이 커밋에 포함되지 않는다.)

---

### Task 6: 전체 검증

**Files:**
- (변경 없음 — 검증만)

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS, 실패 0건

- [ ] **Step 2: 타입 체크 및 빌드**

Run: `npm run build`
Expected: 에러 없이 빌드 완료 (`tsc -b && vite build`)

- [ ] **Step 3: 배포 후 실제 프로덕션 엔드포인트로 스모크 테스트**

Task 5에서 Vercel 환경변수 등록 후 배포되면(또는 `vercel --prod`로 수동 배포 후):

```bash
curl -s "https://trade-review-eight.vercel.app/api/quote?symbol=AAPL"
curl -s "https://trade-review-eight.vercel.app/api/search?q=apple"
curl -s "https://trade-review-eight.vercel.app/api/history?symbol=AAPL"
```
Expected: 세 응답 모두 200과 실제 데이터 (더 이상 `{"error":"..."}` 502 아님)

- [ ] **Step 4: 한국 종목 경로가 그대로인지 확인 (회귀 없음)**

Run:
```bash
curl -s "https://trade-review-eight.vercel.app/api/quote?symbol=005930.KS"
```
Expected: Yahoo 쪽 rate limit이 여전하면 이전과 동일하게 502 — 이번 작업으로 한국 경로의 동작이 변하지 않았음을 확인하는 것이 목적(고쳐지는 것이 목적이 아님)
