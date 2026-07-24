# Market Data Provider Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken FMP (quota-exhausted) and Yahoo Finance (blocked/unofficial) market-data dependencies with 공공데이터포털 (KR quote/history + a bundled KR search listing) and Twelve Data (US quote/history/search).

**Architecture:** Keep the existing `isKoreanSymbol()` market split in `api/search.ts`/`api/quote.ts`/`api/history.ts` unchanged; swap what runs behind each branch. Two new provider client modules (`api/_lib/dataGoKr.ts`, `api/_lib/twelveData.ts`) replace `api/_lib/fmp.ts`, which is deleted along with the `yahoo-finance2` dependency. KR search becomes a local filter over a repo-bundled JSON listing instead of a live API call.

**Tech Stack:** TypeScript, Vercel serverless functions (`@vercel/node`), Vitest, plain `fetch` (no new npm dependencies).

## Global Constraints

- Node >=20 (existing `package.json` `engines.node`).
- New env vars: `DATA_GO_KR_API_KEY`, `TWELVE_DATA_API_KEY`. Both are read via `process.env` exactly like the existing `FMP_API_KEY` pattern in `api/_lib/fmp.ts`.
- `api/_lib/fmp.ts`, `api/_lib/fmp.test.ts`, the `yahoo-finance2` npm dependency, and all `FMP_API_KEY` references are removed by the end of this plan — nothing may reference them afterward.
- KR symbols keep the app's existing `.KS`/`.KQ` suffix convention (`isKoreanSymbol` in `api/_lib/fmp.ts` today: `/\.(ks|kq)$/i`) as the external-facing format, even though the backend no longer calls Yahoo.
- History bars are always returned oldest-first (existing `HistoryBar`/`fmpHistory` contract) — both new history sources must be sorted/reversed to match.
- KR quote/history is EOD-only, one business day behind (T+1) — this is an accepted, confirmed constraint, not a bug to work around.
- Twelve Data fully replaces FMP for non-KR symbols; no secondary/fallback provider for US data (confirmed decision).
- Search debounce: exactly 300ms. Client-side quote/history cache TTL: exactly 5 minutes (300000ms).
- Follow the existing test-mocking convention from `api/_lib/fmp.test.ts`: `vi.stubGlobal('fetch', vi.fn().mockResolvedValue(...))` per test, `process.env.<KEY> = 'test-key'` in `beforeEach`, `vi.unstubAllGlobals()` in `afterEach`.
- The 공공데이터포털 `getStockPriceInfo` request parameter names (`likeSrtnCd`, `basDt`, `beginBasDt`, `endBasDt`, `numOfRows`, `pageNo`, `resultType`) and the response envelope (`response.header.resultCode`/`resultMsg`, `response.body.items.item`, fields `basDt`/`srtnCd`/`itmsNm`/`clpr`) are taken from public documentation and community reference implementations — this account has no real `DATA_GO_KR_API_KEY` to verify against. The envelope shape (`response.header`/`response.body.items`) is data.go.kr's standard convention shared across nearly all of its OpenAPI services, so it is used with reasonable confidence; the specific field names are the part to double-check once a real key is available (see Task 3).

---

### Task 1: Extract `isKoreanSymbol` into its own module

`isKoreanSymbol` currently lives in `api/_lib/fmp.ts`, which this plan deletes in Task 8. It has two other callers (`api/quote.ts`, `api/history.ts`) that must keep working after `fmp.ts` is gone, so it needs a home that isn't `fmp.ts`.

**Files:**
- Create: `api/_lib/marketSymbol.ts`
- Create: `api/_lib/marketSymbol.test.ts`
- Modify: `api/_lib/fmp.ts` (remove `isKoreanSymbol`)
- Modify: `api/_lib/fmp.test.ts` (remove the `isKoreanSymbol` describe block and its import)
- Modify: `api/quote.ts` (import `isKoreanSymbol` from the new module)
- Modify: `api/history.ts` (same)

**Interfaces:**
- Produces: `isKoreanSymbol(symbol: string): boolean` from `api/_lib/marketSymbol.ts`, used by Tasks 4 (`krxListing.ts`... no, `krxListing.ts` doesn't need it), 6, and 7.

- [ ] **Step 1: Write the failing test**

Create `api/_lib/marketSymbol.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/marketSymbol.test.ts`
Expected: FAIL with "Failed to resolve import './marketSymbol'" (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `api/_lib/marketSymbol.ts`:

```ts
export function isKoreanSymbol(symbol: string): boolean {
  return /\.(ks|kq)$/i.test(symbol);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/marketSymbol.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Remove the old copy and update its callers**

In `api/_lib/fmp.ts`, delete this block (currently the first thing in the file):

```ts
export function isKoreanSymbol(symbol: string): boolean {
  return /\.(ks|kq)$/i.test(symbol);
}
```

In `api/_lib/fmp.test.ts`, delete the import of `isKoreanSymbol` and this whole `describe` block:

```ts
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
```

leaving `fmp.test.ts`'s import line as:

```ts
import { fmpQuote, fmpSearch, fmpHistory } from './fmp';
```

In `api/quote.ts`, change:

```ts
import { isKoreanSymbol, fmpQuote } from './_lib/fmp.js';
```

to:

```ts
import { isKoreanSymbol } from './_lib/marketSymbol.js';
import { fmpQuote } from './_lib/fmp.js';
```

In `api/history.ts`, change:

```ts
import { isKoreanSymbol, fmpHistory } from './_lib/fmp.js';
```

to:

```ts
import { isKoreanSymbol } from './_lib/marketSymbol.js';
import { fmpHistory } from './_lib/fmp.js';
```

Run: `npx vitest run`
Expected: PASS (full suite, same count as before minus 0 — tests moved, not lost)

- [ ] **Step 6: Commit**

```bash
git add api/_lib/marketSymbol.ts api/_lib/marketSymbol.test.ts api/_lib/fmp.ts api/_lib/fmp.test.ts api/quote.ts api/history.ts
git commit -m "refactor: isKoreanSymbol을 별도 모듈로 분리 (fmp.ts 제거 대비)"
```

---

### Task 2: Twelve Data client

**Files:**
- Create: `api/_lib/twelveData.ts`
- Create: `api/_lib/twelveData.test.ts`

**Interfaces:**
- Produces:
  - `twelveDataQuote(symbol: string): Promise<{ symbol: string; price: number }>`
  - `twelveDataHistory(symbol: string): Promise<{ date: string; price: number }[]>` (oldest-first)
  - `twelveDataSearch(query: string): Promise<{ symbol: string; name: string; exchange: string }[]>`
  - Used by Tasks 5, 6, 7.

- [ ] **Step 1: Write the failing tests**

Create `api/_lib/twelveData.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { twelveDataQuote, twelveDataHistory, twelveDataSearch } from './twelveData';

beforeEach(() => {
  process.env.TWELVE_DATA_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('twelveDataQuote', () => {
  it('returns symbol and price parsed from the close field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbol: 'AAPL', close: '320.27' }) })
    );
    const quote = await twelveDataQuote('AAPL');
    expect(quote).toEqual({ symbol: 'AAPL', price: 320.27 });
  });

  it('requests the quote endpoint with the symbol', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ symbol: 'AAPL', close: '320.27' }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataQuote('AAPL');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/quote?');
    expect(url).toContain('symbol=AAPL');
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(twelveDataQuote('AAPL')).rejects.toThrow();
  });

  it('throws when the body reports status "error" despite a 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'error', message: 'bad symbol' }) })
    );
    await expect(twelveDataQuote('BAD')).rejects.toThrow();
  });
});

describe('twelveDataHistory', () => {
  it('maps values to {date, price}, reversed to oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', close: '7.39' },
            { datetime: '2026-07-17', close: '7.1' },
          ],
        }),
      })
    );
    const bars = await twelveDataHistory('JOBY');
    expect(bars).toEqual([
      { date: '2026-07-17', price: 7.1 },
      { date: '2026-07-18', price: 7.39 },
    ]);
  });

  it('requests the time_series endpoint with a 1day interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ values: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataHistory('JOBY');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/time_series?');
    expect(url).toContain('symbol=JOBY');
    expect(url).toContain('interval=1day');
  });
});

describe('twelveDataSearch', () => {
  it('maps Twelve Data fields to {symbol, name, exchange}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ symbol: 'AAPL', instrument_name: 'Apple Inc', exchange: 'NASDAQ' }] }),
      })
    );
    const results = await twelveDataSearch('apple');
    expect(results).toEqual([{ symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' }]);
  });

  it('requests the symbol_search endpoint with the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataSearch('apple');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/symbol_search?');
    expect(url).toContain('symbol=apple');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/twelveData.test.ts`
Expected: FAIL with "Failed to resolve import './twelveData'"

- [ ] **Step 3: Write the implementation**

Create `api/_lib/twelveData.ts`:

```ts
interface TwelveDataQuoteResponse {
  symbol: string;
  close: string;
}

interface TwelveDataTimeSeriesValue {
  datetime: string;
  close: string;
}

interface TwelveDataTimeSeriesResponse {
  values: TwelveDataTimeSeriesValue[];
}

interface TwelveDataSearchResult {
  symbol: string;
  instrument_name: string;
  exchange: string;
}

interface TwelveDataSearchResponse {
  data: TwelveDataSearchResult[];
}

interface TwelveDataErrorBody {
  status?: string;
  message?: string;
}

function twelveDataApiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY is not set');
  return key;
}

async function twelveDataFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ ...params, apikey: twelveDataApiKey() });
  const res = await fetch(`https://api.twelvedata.com/${path}?${search.toString()}`);
  if (!res.ok) throw new Error(`Twelve Data request failed: ${res.status}`);
  const data = await res.json();
  if ((data as TwelveDataErrorBody).status === 'error') {
    throw new Error(`Twelve Data error: ${(data as TwelveDataErrorBody).message ?? 'unknown'}`);
  }
  return data;
}

export async function twelveDataQuote(symbol: string): Promise<{ symbol: string; price: number }> {
  const data = (await twelveDataFetch('quote', { symbol })) as TwelveDataQuoteResponse;
  return { symbol: data.symbol, price: Number(data.close) };
}

export async function twelveDataHistory(symbol: string): Promise<{ date: string; price: number }[]> {
  const data = (await twelveDataFetch('time_series', {
    symbol,
    interval: '1day',
    outputsize: '365',
  })) as TwelveDataTimeSeriesResponse;
  return [...data.values].reverse().map((v) => ({ date: v.datetime, price: Number(v.close) }));
}

export async function twelveDataSearch(
  query: string
): Promise<{ symbol: string; name: string; exchange: string }[]> {
  const data = (await twelveDataFetch('symbol_search', { symbol: query })) as TwelveDataSearchResponse;
  return data.data.map((r) => ({ symbol: r.symbol, name: r.instrument_name, exchange: r.exchange ?? '' }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/twelveData.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/twelveData.ts api/_lib/twelveData.test.ts
git commit -m "feat: Twelve Data 클라이언트 추가 (quote/history/search)"
```

---

### Task 3: 공공데이터포털 (data.go.kr) client

**Files:**
- Create: `api/_lib/dataGoKr.ts`
- Create: `api/_lib/dataGoKr.test.ts`

**Interfaces:**
- Consumes: none (standalone; symbol suffix-stripping is self-contained, does not need `isKoreanSymbol` from Task 1).
- Produces:
  - `dataGoKrQuote(symbol: string): Promise<{ symbol: string; price: number }>`
  - `dataGoKrHistory(symbol: string): Promise<{ date: string; price: number }[]>` (oldest-first)
  - Used by Tasks 6, 7.

- [ ] **Step 1: Write the failing tests**

Create `api/_lib/dataGoKr.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dataGoKrQuote, dataGoKrHistory } from './dataGoKr';

beforeEach(() => {
  process.env.DATA_GO_KR_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okResponse(items: { basDt: string; srtnCd: string; clpr: string }[]) {
  return {
    ok: true,
    json: async () => ({
      response: {
        header: { resultCode: '00', resultMsg: 'OK' },
        body: {
          items: items.length === 0 ? '' : { item: items },
          numOfRows: items.length,
          pageNo: 1,
          totalCount: items.length,
        },
      },
    }),
  };
}

describe('dataGoKrQuote', () => {
  it('returns the requested symbol and latest close price', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse([{ basDt: '20260723', srtnCd: '005930', clpr: '71000' }]))
    );
    const quote = await dataGoKrQuote('005930.KS');
    expect(quote).toEqual({ symbol: '005930.KS', price: 71000 });
  });

  it('requests getStockPriceInfo with the KR suffix stripped', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse([{ basDt: '20260723', srtnCd: '005930', clpr: '71000' }]));
    vi.stubGlobal('fetch', fetchMock);
    await dataGoKrQuote('005930.KS');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/GetStockSecuritiesInfoService/getStockPriceInfo?');
    expect(url).toContain('likeSrtnCd=005930');
  });

  it('throws when data.go.kr returns no rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse([])));
    await expect(dataGoKrQuote('005930.KS')).rejects.toThrow();
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(dataGoKrQuote('005930.KS')).rejects.toThrow();
  });

  it('throws when the response envelope reports a non-success resultCode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: { header: { resultCode: '30', resultMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } },
        }),
      })
    );
    await expect(dataGoKrQuote('005930.KS')).rejects.toThrow();
  });
});

describe('dataGoKrHistory', () => {
  it('maps rows to {date, price} sorted oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse([
          { basDt: '20260718', srtnCd: '005930', clpr: '72000' },
          { basDt: '20260717', srtnCd: '005930', clpr: '71000' },
        ])
      )
    );
    const bars = await dataGoKrHistory('005930.KS');
    expect(bars).toEqual([
      { date: '2026-07-17', price: 71000 },
      { date: '2026-07-18', price: 72000 },
    ]);
  });

  it('requests a beginBasDt/endBasDt range with the KR suffix stripped', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    await dataGoKrHistory('005930.KS');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('likeSrtnCd=005930');
    expect(url).toContain('beginBasDt=');
    expect(url).toContain('endBasDt=');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/dataGoKr.test.ts`
Expected: FAIL with "Failed to resolve import './dataGoKr'"

- [ ] **Step 3: Write the implementation**

Create `api/_lib/dataGoKr.ts`:

```ts
interface DataGoKrStockPriceRow {
  basDt: string;
  srtnCd: string;
  clpr: string;
}

interface DataGoKrResponse {
  response: {
    header: { resultCode: string; resultMsg: string };
    body?: {
      items: { item: DataGoKrStockPriceRow[] } | '';
      numOfRows: number;
      pageNo: number;
      totalCount: number;
    };
  };
}

function dataGoKrApiKey(): string {
  const key = process.env.DATA_GO_KR_API_KEY;
  if (!key) throw new Error('DATA_GO_KR_API_KEY is not set');
  return key;
}

function stripKrSuffix(symbol: string): string {
  return symbol.replace(/\.(ks|kq)$/i, '');
}

function formatBasDt(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

async function dataGoKrFetch(params: Record<string, string>): Promise<DataGoKrStockPriceRow[]> {
  const search = new URLSearchParams({
    ...params,
    serviceKey: dataGoKrApiKey(),
    resultType: 'json',
  });
  const res = await fetch(
    `http://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?${search.toString()}`
  );
  if (!res.ok) throw new Error(`data.go.kr request failed: ${res.status}`);
  const data = (await res.json()) as DataGoKrResponse;
  if (data.response.header.resultCode !== '00') {
    throw new Error(`data.go.kr error: ${data.response.header.resultMsg}`);
  }
  const items = data.response.body?.items;
  return !items || items === '' ? [] : items.item;
}

export async function dataGoKrQuote(symbol: string): Promise<{ symbol: string; price: number }> {
  const rows = await dataGoKrFetch({ likeSrtnCd: stripKrSuffix(symbol), numOfRows: '1', pageNo: '1' });
  if (!rows[0]) throw new Error(`data.go.kr quote returned no data for ${symbol}`);
  return { symbol, price: Number(rows[0].clpr) };
}

export async function dataGoKrHistory(symbol: string): Promise<{ date: string; price: number }[]> {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 1);
  const rows = await dataGoKrFetch({
    likeSrtnCd: stripKrSuffix(symbol),
    beginBasDt: formatBasDt(from),
    endBasDt: formatBasDt(to),
    numOfRows: '500',
    pageNo: '1',
  });
  return [...rows]
    .sort((a, b) => a.basDt.localeCompare(b.basDt))
    .map((r) => ({
      date: `${r.basDt.slice(0, 4)}-${r.basDt.slice(4, 6)}-${r.basDt.slice(6, 8)}`,
      price: Number(r.clpr),
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/dataGoKr.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/dataGoKr.ts api/_lib/dataGoKr.test.ts
git commit -m "feat: 공공데이터포털(data.go.kr) 주식시세정보 클라이언트 추가"
```

**Note for whoever obtains the real `DATA_GO_KR_API_KEY`:** make one real call to `getStockPriceInfo` (e.g. via curl) and diff the actual JSON shape against `DataGoKrResponse`/`DataGoKrStockPriceRow` above. If field names differ, fix them here — this task's tests will still pass (they test the mapping logic against a fixture, not the live API), but production calls will silently 502 until the mapping matches reality.

---

### Task 4: KR bundled search listing

**Files:**
- Create: `api/_lib/krxListing.ts`
- Create: `api/_lib/krxListing.test.ts`
- Create: `scripts/fetch-krx-listing.mjs`
- Create: `src/data/krx-listing.json` (placeholder)

**Interfaces:**
- Produces: `searchKrxListing(listing: { symbol: string; name: string }[], query: string): { symbol: string; name: string; exchange: string }[]`, used by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `api/_lib/krxListing.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/krxListing.test.ts`
Expected: FAIL with "Failed to resolve import './krxListing'"

- [ ] **Step 3: Write the implementation**

Create `api/_lib/krxListing.ts`:

```ts
export interface KrxListingEntry {
  symbol: string;
  name: string;
}

export interface KrxSearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

function exchangeForSymbol(symbol: string): string {
  if (/\.ks$/i.test(symbol)) return 'KOSPI';
  if (/\.kq$/i.test(symbol)) return 'KOSDAQ';
  return '';
}

export function searchKrxListing(listing: KrxListingEntry[], query: string): KrxSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return listing
    .filter((item) => item.symbol.toLowerCase().includes(q) || item.name.toLowerCase().includes(q))
    .map((item) => ({ symbol: item.symbol, name: item.name, exchange: exchangeForSymbol(item.symbol) }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/_lib/krxListing.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the placeholder data file and the (untested, manually-run) refresh script**

Create `src/data/krx-listing.json`:

```json
[]
```

Create `scripts/fetch-krx-listing.mjs`:

```js
// 공공데이터포털 KRX상장종목정보 API에서 전체 상장종목 목록을 받아와
// src/data/krx-listing.json을 갱신하는 1회성/수시 실행 스크립트.
// (자동화하지 않음 — 신규상장/상장폐지가 있을 때만 사용자가 수동 실행)
//
// 실행: DATA_GO_KR_API_KEY=<발급받은키> node scripts/fetch-krx-listing.mjs
import { writeFileSync } from 'node:fs';

const API_KEY = process.env.DATA_GO_KR_API_KEY;
if (!API_KEY) {
  console.error('DATA_GO_KR_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

function suffixForMarket(mrktCtg) {
  return mrktCtg === 'KOSDAQ' ? '.KQ' : '.KS';
}

async function fetchPage(pageNo, numOfRows) {
  const params = new URLSearchParams({
    serviceKey: API_KEY,
    resultType: 'json',
    numOfRows: String(numOfRows),
    pageNo: String(pageNo),
  });
  const res = await fetch(
    `http://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo?${params.toString()}`
  );
  if (!res.ok) throw new Error(`data.go.kr request failed: ${res.status}`);
  return res.json();
}

async function main() {
  const numOfRows = 1000;
  const first = await fetchPage(1, numOfRows);
  if (first.response.header.resultCode !== '00') {
    throw new Error(`data.go.kr error: ${first.response.header.resultMsg}`);
  }
  const totalCount = first.response.body.totalCount;
  const rows = first.response.body.items === '' ? [] : first.response.body.items.item;

  const totalPages = Math.ceil(totalCount / numOfRows);
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(page, numOfRows);
    const nextRows = next.response.body.items === '' ? [] : next.response.body.items.item;
    rows.push(...nextRows);
  }

  const seen = new Set();
  const listing = [];
  for (const row of rows) {
    const symbol = `${row.srtnCd}${suffixForMarket(row.mrktCtg)}`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    listing.push({ symbol, name: row.itmsNm });
  }

  writeFileSync('src/data/krx-listing.json', JSON.stringify(listing, null, 2) + '\n');
  console.log(`src/data/krx-listing.json 갱신 완료: ${listing.length}개 종목`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

This script has no automated test: it is a manually-run utility gated on a real `DATA_GO_KR_API_KEY` the implementer does not have, and its logic (pagination + field mapping) is already covered indirectly by `dataGoKr.test.ts`'s response-shape assumptions. Its field-name assumptions (`srtnCd`, `mrktCtg`, `itmsNm`) carry the same unverified-against-live-API caveat as Task 3.

Run: `npx vitest run`
Expected: PASS (full suite; the new placeholder JSON and script are not exercised by any test)

- [ ] **Step 6: Commit**

```bash
git add api/_lib/krxListing.ts api/_lib/krxListing.test.ts scripts/fetch-krx-listing.mjs src/data/krx-listing.json
git commit -m "feat: KR 종목 검색용 번들 리스팅 + 갱신 스크립트 추가"
```

---

### Task 5: Swap `api/search.ts` to Twelve Data + bundled KR listing

**Files:**
- Modify: `api/search.ts`
- Modify: `api/search.test.ts`

**Interfaces:**
- Consumes: `searchKrxListing` (Task 4), `twelveDataSearch` (Task 2), `src/data/krx-listing.json` (Task 4).

- [ ] **Step 1: Rewrite the test file for the new sources**

Replace the full contents of `api/search.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './search';

vi.mock('../src/data/krx-listing.json', () => ({
  default: [
    { symbol: '005930.KS', name: '삼성전자' },
    { symbol: '035720.KQ', name: '카카오' },
  ],
}));

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function mockTwelveDataSearchOk(body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
}

function mockTwelveDataSearchFail() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
}

beforeEach(() => {
  process.env.TWELVE_DATA_API_KEY = 'test-key';
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

  it('merges KR bundled-listing matches with Twelve Data results', async () => {
    mockTwelveDataSearchOk({ data: [{ symbol: 'AAPL', instrument_name: 'Apple Inc', exchange: 'NASDAQ' }] });

    const res = mockRes();
    await handler({ query: { q: '삼성' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [
        { symbol: '005930.KS', name: '삼성전자', exchange: 'KOSPI' },
        { symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ' },
      ],
    });
  });

  it('returns only KR matches when Twelve Data fails, without a 502', async () => {
    mockTwelveDataSearchFail();

    const res = mockRes();
    await handler({ query: { q: '카카오' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: '035720.KQ', name: '카카오', exchange: 'KOSDAQ' }],
    });
  });

  it('returns an empty list when nothing matches on either side', async () => {
    mockTwelveDataSearchOk({ data: [] });

    const res = mockRes();
    await handler({ query: { q: 'zzzznomatch' } } as any, res);

    expect(res.json).toHaveBeenCalledWith({ symbols: [] });
  });
});
```

Note: the old "returns 502 when both sources fail" case no longer applies — the KR side is a local array filter that cannot fail, so total-failure is no longer a reachable state. This is an intentional simplification, not a dropped requirement (see spec's Error handling section: an empty result set is a valid 200, not an error).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/search.test.ts`
Expected: FAIL (current `search.ts` still imports `yahoo-finance2`/`fmpSearch`, mismatched with the new mocks/expectations)

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `api/search.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import krxListingData from '../src/data/krx-listing.json';
import { searchKrxListing } from './_lib/krxListing.js';
import { twelveDataSearch } from './_lib/twelveData.js';

interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query.q;
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }

  const krResults = searchKrxListing(krxListingData as { symbol: string; name: string }[], query);
  const [usOutcome] = await Promise.allSettled([twelveDataSearch(query)]);

  const seen = new Set<string>();
  const symbols: SymbolResult[] = [];
  for (const item of krResults) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    symbols.push(item);
  }
  if (usOutcome.status === 'fulfilled') {
    for (const item of usOutcome.value) {
      if (seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      symbols.push(item);
    }
  }
  res.status(200).json({ symbols });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/search.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add api/search.ts api/search.test.ts
git commit -m "feat: 검색 API를 Twelve Data + 번들 KR 리스팅으로 교체"
```

---

### Task 6: Swap `api/quote.ts` to data.go.kr + Twelve Data

**Files:**
- Modify: `api/quote.ts`
- Modify: `api/quote.test.ts`

**Interfaces:**
- Consumes: `isKoreanSymbol` (Task 1), `dataGoKrQuote` (Task 3), `twelveDataQuote` (Task 2).

- [ ] **Step 1: Rewrite the test file**

Replace the full contents of `api/quote.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './quote';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  process.env.DATA_GO_KR_API_KEY = 'test-key';
  process.env.TWELVE_DATA_API_KEY = 'test-key';
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

  it('routes Korean symbols (.KS) to data.go.kr and reports currency as KRW', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            header: { resultCode: '00', resultMsg: 'OK' },
            body: {
              items: { item: [{ basDt: '20260723', srtnCd: '005930', clpr: '71000' }] },
              numOfRows: 1,
              pageNo: 1,
              totalCount: 1,
            },
          },
        }),
      })
    );
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: '005930.KS', price: 71000, currency: 'KRW' });
  });

  it('returns 502 when data.go.kr lookup fails for a Korean symbol', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to Twelve Data and reports currency as USD', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbol: 'AAPL', close: '320.27' }) })
    );
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: 'AAPL', price: 320.27, currency: 'USD' });
  });

  it('returns 502 when the Twelve Data lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'AAPL' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/quote.test.ts`
Expected: FAIL (current `quote.ts` still uses `yahoo-finance2`/`fmpQuote`, mismatched mocks)

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `api/quote.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isKoreanSymbol } from './_lib/marketSymbol.js';
import { dataGoKrQuote } from './_lib/dataGoKr.js';
import { twelveDataQuote } from './_lib/twelveData.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const quote = await dataGoKrQuote(symbol);
      res.status(200).json({ symbol: quote.symbol, price: quote.price, currency: 'KRW' });
      return;
    }
    const quote = await twelveDataQuote(symbol);
    res.status(200).json({ symbol: quote.symbol, price: quote.price, currency: 'USD' });
  } catch {
    res.status(502).json({ error: 'Quote lookup failed' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/quote.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add api/quote.ts api/quote.test.ts
git commit -m "feat: 시세 조회 API를 data.go.kr(KR) + Twelve Data(US)로 교체"
```

---

### Task 7: Swap `api/history.ts` to data.go.kr + Twelve Data

**Files:**
- Modify: `api/history.ts`
- Modify: `api/history.test.ts`

**Interfaces:**
- Consumes: `isKoreanSymbol` (Task 1), `dataGoKrHistory` (Task 3), `twelveDataHistory` (Task 2).

- [ ] **Step 1: Rewrite the test file**

Replace the full contents of `api/history.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './history';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  process.env.DATA_GO_KR_API_KEY = 'test-key';
  process.env.TWELVE_DATA_API_KEY = 'test-key';
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

  it('routes Korean symbols (.KS) to data.go.kr and maps rows to {date, close} bars, oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            header: { resultCode: '00', resultMsg: 'OK' },
            body: {
              items: {
                item: [
                  { basDt: '20260718', srtnCd: '005930', clpr: '72000' },
                  { basDt: '20260717', srtnCd: '005930', clpr: '71000' },
                ],
              },
              numOfRows: 2,
              pageNo: 1,
              totalCount: 2,
            },
          },
        }),
      })
    );
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-17', close: 71000 },
        { date: '2026-07-18', close: 72000 },
      ],
    });
  });

  it('returns 502 when data.go.kr lookup fails for a Korean symbol', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ query: { symbol: '005930.KS' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('routes non-Korean symbols to Twelve Data and maps close to close, oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', close: '7.39' },
            { datetime: '2026-07-17', close: '7.1' },
          ],
        }),
      })
    );
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-17', close: 7.1 },
        { date: '2026-07-18', close: 7.39 },
      ],
    });
  });

  it('returns 502 when the Twelve Data lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

Note: the old "filters out non-finite close" test is dropped — that behavior was specific to Yahoo's intraday-chart API filling non-trading calendar days with `null`. Neither data.go.kr's `getStockPriceInfo` (one row per actual trading day) nor Twelve Data's `time_series` produces that shape, so the filter no longer has a case to cover.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/history.test.ts`
Expected: FAIL (current `history.ts` still uses `yahoo-finance2`/`fmpHistory`, mismatched mocks)

- [ ] **Step 3: Rewrite the implementation**

Replace the full contents of `api/history.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isKoreanSymbol } from './_lib/marketSymbol.js';
import { dataGoKrHistory } from './_lib/dataGoKr.js';
import { twelveDataHistory } from './_lib/twelveData.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    if (isKoreanSymbol(symbol)) {
      const rows = await dataGoKrHistory(symbol);
      res.status(200).json({ bars: rows.map((r) => ({ date: r.date, close: r.price })) });
      return;
    }
    const rows = await twelveDataHistory(symbol);
    res.status(200).json({ bars: rows.map((r) => ({ date: r.date, close: r.price })) });
  } catch {
    res.status(502).json({ error: 'History lookup failed' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/history.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add api/history.ts api/history.test.ts
git commit -m "feat: 과거시세 조회 API를 data.go.kr(KR) + Twelve Data(US)로 교체"
```

---

### Task 8: Remove FMP and yahoo-finance2

By this point nothing imports `api/_lib/fmp.ts` or `yahoo-finance2` — Tasks 5-7 replaced every caller.

**Files:**
- Delete: `api/_lib/fmp.ts`
- Delete: `api/_lib/fmp.test.ts`
- Modify: `package.json` (remove `yahoo-finance2` dependency)

- [ ] **Step 1: Confirm nothing still references them**

Run: `grep -rn "yahoo-finance2\|_lib/fmp\|FMP_API_KEY" api src package.json --include="*.ts" --include="*.tsx" --include="*.json"`
Expected: only `api/_lib/fmp.ts`/`api/_lib/fmp.test.ts` (about to be deleted) and the `yahoo-finance2` line in `package.json` (about to be removed) appear. No other file matches.

- [ ] **Step 2: Delete the files**

```bash
git rm api/_lib/fmp.ts api/_lib/fmp.test.ts
```

- [ ] **Step 3: Remove the dependency**

In `package.json`, remove this line from `dependencies`:

```json
    "yahoo-finance2": "^2.11.3"
```

(the line above it, `"react-dom": "^18.3.1",`, keeps its trailing comma removed if `yahoo-finance2` was the last entry — check the resulting JSON is valid).

Run: `npm install`
Expected: updates `package-lock.json` to drop `yahoo-finance2` and its transitive-only dependencies; exits 0.

- [ ] **Step 4: Run the full suite and build**

Run: `npx vitest run`
Expected: PASS (no test references the deleted files)

Run: `npm run build`
Expected: exits 0 (no lingering TS references to `./_lib/fmp.js` or `yahoo-finance2`)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: FMP/yahoo-finance2 제거 (Twelve Data + data.go.kr로 완전 대체)"
```

---

### Task 9: Debounce `TickerSearch` search calls

**Files:**
- Modify: `src/components/TickerSearch.tsx`
- Modify: `src/components/TickerSearch.test.tsx`

- [ ] **Step 1: Rewrite the stale-response test for debounced calls**

In `src/components/TickerSearch.test.tsx`, replace the last test (`'ignores a stale out-of-order response...'`) with:

```tsx
  it('debounces rapid edits into a single call, and still ignores a stale out-of-order response', async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: quotes.SymbolResult[]) => void;
    let resolveSecond!: (value: quotes.SymbolResult[]) => void;

    vi.mocked(quotes.searchSymbols)
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));

    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);
    const input = screen.getByLabelText('종목 검색');

    fireEvent.change(input, { target: { value: 'j' } });
    fireEvent.change(input, { target: { value: 'jo' } });

    // Rapid "j" -> "jo" edit collapses into exactly one debounced call, for the final value.
    await vi.advanceTimersByTimeAsync(300);
    expect(quotes.searchSymbols).toHaveBeenCalledTimes(1);
    expect(quotes.searchSymbols).toHaveBeenCalledWith('jo');

    // A later, separately-debounced query.
    fireEvent.change(input, { target: { value: 'joby' } });
    await vi.advanceTimersByTimeAsync(300);
    expect(quotes.searchSymbols).toHaveBeenCalledTimes(2);

    vi.useRealTimers();

    // Resolve out of order: the later-issued query ("joby") resolves first,
    // then the stale earlier query ("jo") resolves after.
    resolveSecond([{ symbol: 'JOBY', name: 'Joby Aviation', exchange: 'NYQ' }]);
    resolveFirst([{ symbol: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYQ' }]);

    expect(await screen.findByRole('button', { name: /Joby Aviation \(JOBY\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Johnson & Johnson \(JNJ\)/ })).not.toBeInTheDocument();
  });
```

Add `vi.useRealTimers()` to the existing `afterEach` so a failure mid-test can't leak fake timers into later tests. Change:

```tsx
afterEach(() => cleanup());
```

to:

```tsx
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/TickerSearch.test.tsx`
Expected: FAIL — `searchSymbols` is called twice (once per keystroke) before any debounce exists, so `toHaveBeenCalledTimes(1)` after the first `advanceTimersByTimeAsync(300)` fails.

- [ ] **Step 3: Add the debounce**

In `src/components/TickerSearch.tsx`, replace:

```tsx
export function TickerSearch({ positions, onSelectTicker }: TickerSearchProps) {
  const [query, setQuery] = useState('');
  const [apiResults, setApiResults] = useState<SymbolResult[]>([]);
  const latestQueryRef = useRef('');
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleChange(next: string) {
    setQuery(next);
    latestQueryRef.current = next;
    const results = next.trim() ? await searchSymbols(next) : [];
    if (latestQueryRef.current === next) {
      setApiResults(results);
    }
  }

  function clearSearch() {
    setQuery('');
    setApiResults([]);
    latestQueryRef.current = '';
  }
```

with:

```tsx
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
```

The input's `onChange={(e) => handleChange(e.target.value)}` call site is unchanged (`handleChange` is no longer `async`, but it's still valid as an event handler return value is ignored either way).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/TickerSearch.test.tsx`
Expected: PASS (7 tests — the 5 unchanged tests still pass because `findByRole`'s default ~1s polling window comfortably exceeds the 300ms real-timer debounce in tests that don't use fake timers)

- [ ] **Step 5: Commit**

```bash
git add src/components/TickerSearch.tsx src/components/TickerSearch.test.tsx
git commit -m "feat: 종목 검색에 300ms debounce 추가 (Twelve Data 분당 호출 한도 보호)"
```

---

### Task 10: Client-side quote/history cache

**Files:**
- Modify: `src/api/quotes.ts`
- Modify: `src/api/quotes.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/api/quotes.test.ts` (after the existing `fetchHistory` describe block):

```ts
describe('fetchQuote caching', () => {
  it('does not call fetch again for the same symbol within the cache TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: 100, currency: 'USD' }) });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchQuote('CACHE_TEST_QUOTE_1');
    const second = await fetchQuote('CACHE_TEST_QUOTE_1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('calls fetch again once the 5-minute cache TTL has expired', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: 100, currency: 'USD' }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuote('CACHE_TEST_QUOTE_2');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetchQuote('CACHE_TEST_QUOTE_2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not cache a failed lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await fetchQuote('CACHE_TEST_QUOTE_3');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ price: 200, currency: 'USD' }) })
    );
    const result = await fetchQuote('CACHE_TEST_QUOTE_3');

    expect(result).toEqual({ price: 200, currency: 'USD' });
  });
});

describe('fetchHistory caching', () => {
  it('does not call fetch again for the same symbol within the cache TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bars: [{ date: '2026-07-17', close: 100 }] }) });
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchHistory('CACHE_TEST_HISTORY_1');
    const second = await fetchHistory('CACHE_TEST_HISTORY_1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('calls fetch again once the 5-minute cache TTL has expired', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bars: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchHistory('CACHE_TEST_HISTORY_2');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetchHistory('CACHE_TEST_HISTORY_2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
```

Add `vi.useRealTimers()` cleanup to this file's existing `afterEach`. Change:

```ts
afterEach(() => {
  vi.unstubAllGlobals();
});
```

to:

```ts
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/quotes.test.ts`
Expected: FAIL — every "within the cache TTL" test currently calls `fetch` twice (no caching exists yet), so `toHaveBeenCalledTimes(1)` fails.

- [ ] **Step 3: Add the cache**

In `src/api/quotes.ts`, replace:

```ts
export async function fetchQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchHistory(symbol: string): Promise<HistoryBar[]> {
  try {
    const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.bars;
  } catch {
    return [];
  }
}
```

with:

```ts
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const quoteCache = new Map<string, CacheEntry<QuoteResult>>();
const historyCache = new Map<string, CacheEntry<HistoryBar[]>>();

export async function fetchQuote(symbol: string): Promise<QuoteResult | null> {
  const cached = quoteCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const value = (await res.json()) as QuoteResult;
    quoteCache.set(symbol, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}

export async function fetchHistory(symbol: string): Promise<HistoryBar[]> {
  const cached = historyCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  try {
    const res = await fetch(`/api/history?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const value = data.bars as HistoryBar[];
    historyCache.set(symbol, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/quotes.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Run the full suite and build, then commit**

Run: `npx vitest run`
Expected: PASS (full suite)

Run: `npm run build`
Expected: exits 0

```bash
git add src/api/quotes.ts src/api/quotes.test.ts
git commit -m "feat: 시세/과거시세 조회에 5분 세션 캐시 추가 (Twelve Data 호출 한도 보호)"
```

---

## After all tasks: rollout reminder

This plan produces working, tested code against the documented/community-verified provider contracts (see Global Constraints' caveat on data.go.kr). Before it's useful in production, the user still needs to (per the spec's Rollout section, not part of this plan's tasks):

1. Obtain a `DATA_GO_KR_API_KEY` (data.go.kr, 금융위원회_주식시세정보 + 금융위원회_KRX상장종목정보) and a `TWELVE_DATA_API_KEY` (twelvedata.com).
2. Run `DATA_GO_KR_API_KEY=<key> node scripts/fetch-krx-listing.mjs` locally to populate `src/data/krx-listing.json` for real (it ships as `[]` from Task 4).
3. Add both keys to Vercel's Production + Preview environment variables, and remove `FMP_API_KEY`.
4. Spot-check `dataGoKrQuote`/`dataGoKrHistory` against one real symbol and adjust field mappings in `api/_lib/dataGoKr.ts` if the live response shape differs from the Task 3/4 assumptions.
