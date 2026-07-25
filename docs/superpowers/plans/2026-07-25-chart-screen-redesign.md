# Chart Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the chart screen — dark-mode-aware theming, compliant watermark removal, independent time/price zoom, real OHLC candlesticks, a moving-average legend, higher-contrast trade markers, an inline trade list with memo clamping, and a proper modal for trade detail.

**Architecture:** Upgrade `lightweight-charts` v4.2.3 → v5.2.0. Extend the OHLC data pipeline (both market-data providers → `api/history.ts` → `src/api/quotes.ts`) to carry open/high/low alongside close. Rewrite `PriceChart.tsx` around the new v5 series-creation/marker APIs. Restructure `ChartScreen.tsx`'s trade list/detail presentation.

**Tech Stack:** React, TypeScript, Vite, Vitest, `lightweight-charts` v5.2.0.

## Global Constraints

- `lightweight-charts` target version: **5.2.0** exactly (confirmed latest on npm at plan time).
- Breaking API changes to migrate (confirmed via the installed v4.2.3 type defs, the official v4→v5 migration guide, and the v5.2.0 type defs fetched from unpkg): `chart.addLineSeries(opts)` → `chart.addSeries(LineSeries, opts)`; `chart.addCandlestickSeries(opts)` (never used in v4 here, but is how candles are added) → `chart.addSeries(CandlestickSeries, opts)`; `series.setMarkers(markers)` → `createSeriesMarkers(series, markers)` (returns a plugin object, not a re-usable handle needed here since this component recreates the whole chart per effect run).
- `layout.attributionLogo: boolean` (default `true`) exists in both v4.2.3 and v5.2.0 — confirmed directly in each version's shipped type definitions.
- New in v5, used by this plan: `IPriceScaleApi.setVisibleRange(range: {from,to})`, `.getVisibleRange()`, `.setAutoScale(on: boolean)`.
- Candle colors: up `#dc2626` (red), down `#2563eb` (blue) — KR market convention.
- Moving-average colors: 5일 `#94a3b8`, 20일 `#f59e0b` (lineWidth 3), 50일 `#8b5cf6` (**changed** from `#10b981`), 100일 `#6366f1`, 200일 `#0d9488` (**changed** from `#dc2626`, lineWidth 3).
- Avg-cost line: `#ea580c`, dashed — unchanged.
- Trade markers: buy `#10b981` circle, sell `#a855f7` circle, `size: 2` — replaces the old blue/red arrows.
- Dark theme: background `#18181b`, grid `#27272a`, text `#a1a1aa`. Light theme: background `#ffffff`, grid `#e5e7eb`, text `#71717a`.
- MA legend values render as raw numbers (no thousands separators) — matches the existing app-wide convention (`TradeList.tsx`, `TradeBottomSheet.tsx` both interpolate `trade.price` unformatted).
- Theme detection: no shared React state/context exists for dark/light mode — the only source of truth is the `dark` class on `document.documentElement`, toggled solely by `applyTheme()` in `src/lib/theme.ts`. Components that need it observe that DOM class directly (`MutationObserver`), they do not duplicate `resolveIsDark`/`matchMedia` logic.
- Memo clamp in the inline trade list: exactly 3 lines (`line-clamp-3`), with a "더보기"/"접기" toggle.

---

### Task 1: OHLC in `api/_lib/dataGoKr.ts`

**Files:**
- Modify: `api/_lib/dataGoKr.ts`
- Modify: `api/_lib/dataGoKr.test.ts`

**Interfaces:**
- Produces: `dataGoKrHistory(symbol): Promise<{date, open, high, low, price}[]>` — was `{date, price}[]`. (`price` stays the field name for close, matching this file's existing convention where `dataGoKrQuote` also returns `price` for a close value — not renamed, to keep `dataGoKrQuote`/`dataGoKrHistory`'s shared vocabulary consistent.)

data.go.kr's `getStockPriceInfo` rows already include `mkp` (open), `hipr` (high), `lopr` (low) alongside `clpr` (close) — confirmed via a live call during design. Only the TypeScript row interface and the history mapping need to widen; `dataGoKrQuote` (close-only) and the fetch/error-handling plumbing are untouched.

- [ ] **Step 1: Write the failing test**

In `api/_lib/dataGoKr.test.ts`, find the `okResponse` helper:
```ts
function okResponse(items: { basDt: string; srtnCd: string; clpr: string }[]) {
```
Replace it with:
```ts
function okResponse(
  items: { basDt: string; srtnCd: string; clpr: string; mkp?: string; hipr?: string; lopr?: string }[]
) {
```
(body unchanged — just the parameter type widens to accept the optional new fields.)

Add this test inside the `describe('dataGoKrHistory', ...)` block, alongside the existing `dataGoKrHistory` tests:
```ts
  it('includes open/high/low alongside price (close)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse([
          { basDt: '20260718', srtnCd: '005930', clpr: '72000', mkp: '71000', hipr: '73000', lopr: '70500' },
        ])
      )
    );
    const bars = await dataGoKrHistory('005930.KS');
    expect(bars).toEqual([{ date: '2026-07-18', open: 71000, high: 73000, low: 70500, price: 72000 }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/dataGoKr.test.ts` (use Node 22 — this machine's Node 20.20.2 has a confirmed unrelated Vite crypto bug: `source ~/.nvm/nvm.sh && nvm use 22` first)
Expected: FAIL — `bars` doesn't have `open`/`high`/`low` keys yet (the two other `dataGoKrHistory` tests, which don't check for these fields, keep passing since `toEqual` on those checks only `date`/`price`).

- [ ] **Step 3: Write the implementation**

In `api/_lib/dataGoKr.ts`, replace:
```ts
interface DataGoKrStockPriceRow {
  basDt: string;
  srtnCd: string;
  clpr: string;
}
```
with:
```ts
interface DataGoKrStockPriceRow {
  basDt: string;
  srtnCd: string;
  clpr: string;
  mkp: string;
  hipr: string;
  lopr: string;
}
```

Replace `dataGoKrHistory`:
```ts
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
      price: Number(r.clpr.replace(/,/g, '')),
    }));
}
```
with:
```ts
export async function dataGoKrHistory(
  symbol: string
): Promise<{ date: string; open: number; high: number; low: number; price: number }[]> {
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
      open: Number(r.mkp.replace(/,/g, '')),
      high: Number(r.hipr.replace(/,/g, '')),
      low: Number(r.lopr.replace(/,/g, '')),
      price: Number(r.clpr.replace(/,/g, '')),
    }));
}
```

Update the two existing `dataGoKrHistory` tests' fixtures (the "maps rows to..." test and the comma-stripping test) to include `mkp`/`hipr`/`lopr` in their input rows — pick any sane values (they aren't asserted on by those two tests, only `date`/`price` are), e.g. add `mkp: '71500', hipr: '72500', lopr: '71000'` to each row object. This keeps those two tests passing (`toEqual` on those tests only checks `{date, price}` — if you use `toEqual` with a partial shape it will fail because the real return now has extra keys, so update their assertions too, adding the same `open`/`high`/`low` values you put in the fixture to each expected object).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/dataGoKr.test.ts`
Expected: PASS (11 tests — the 10 that existed plus this new one)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/dataGoKr.ts api/_lib/dataGoKr.test.ts
git commit -m "feat: dataGoKrHistory에 시가/고가/저가 추가"
```

---

### Task 2: OHLC in `api/_lib/twelveData.ts`

**Files:**
- Modify: `api/_lib/twelveData.ts`
- Modify: `api/_lib/twelveData.test.ts`

**Interfaces:**
- Produces: `twelveDataHistory(symbol): Promise<{date, open, high, low, price}[]>` — was `{date, price}[]`.

Twelve Data's `time_series` values already include `open`/`high`/`low` alongside `close` — confirmed via the API docs fetched during design and via a live call.

- [ ] **Step 1: Write the failing test**

In `api/_lib/twelveData.test.ts`, replace the `twelveDataHistory` describe block's first test:
```ts
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
```
with:
```ts
  it('maps values to {date, open, high, low, price}, reversed to oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', open: '7.2', high: '7.45', low: '7.05', close: '7.39' },
            { datetime: '2026-07-17', open: '7.0', high: '7.15', low: '6.95', close: '7.1' },
          ],
        }),
      })
    );
    const bars = await twelveDataHistory('JOBY');
    expect(bars).toEqual([
      { date: '2026-07-17', open: 7.0, high: 7.15, low: 6.95, price: 7.1 },
      { date: '2026-07-18', open: 7.2, high: 7.45, low: 7.05, price: 7.39 },
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/twelveData.test.ts` (Node 22)
Expected: FAIL — actual bars only have `{date, price}`, missing `open`/`high`/`low`.

- [ ] **Step 3: Write the implementation**

In `api/_lib/twelveData.ts`, replace:
```ts
interface TwelveDataTimeSeriesValue {
  datetime: string;
  close: string;
}
```
with:
```ts
interface TwelveDataTimeSeriesValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
}
```

Replace `twelveDataHistory`:
```ts
export async function twelveDataHistory(symbol: string): Promise<{ date: string; price: number }[]> {
  const data = (await twelveDataFetch('time_series', {
    symbol,
    interval: '1day',
    outputsize: '365',
  })) as TwelveDataTimeSeriesResponse;
  return [...data.values].reverse().map((v) => ({ date: v.datetime, price: Number(v.close) }));
}
```
with:
```ts
export async function twelveDataHistory(
  symbol: string
): Promise<{ date: string; open: number; high: number; low: number; price: number }[]> {
  const data = (await twelveDataFetch('time_series', {
    symbol,
    interval: '1day',
    outputsize: '365',
  })) as TwelveDataTimeSeriesResponse;
  return [...data.values].reverse().map((v) => ({
    date: v.datetime,
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    price: Number(v.close),
  }));
}
```

Update the second `twelveDataHistory` test ("requests the time_series endpoint with a 1day interval") — it mocks `json: async () => ({ values: [] })`, which needs no change (empty array maps to empty array regardless of shape).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/twelveData.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/twelveData.ts api/_lib/twelveData.test.ts
git commit -m "feat: twelveDataHistory에 시가/고가/저가 추가"
```

---

### Task 3: OHLC through `api/history.ts` and `src/api/quotes.ts`

**Files:**
- Modify: `api/history.ts`
- Modify: `api/history.test.ts`
- Modify: `src/api/quotes.ts`
- Modify: `src/api/quotes.test.ts`

**Interfaces:**
- Consumes: `dataGoKrHistory`/`twelveDataHistory`'s new `{date, open, high, low, price}` shape (Tasks 1-2).
- Produces: `HistoryBar` type gains `open: number`, `high: number`, `low: number` fields (alongside the existing `date: string`, `close: number`). `/api/history`'s JSON response becomes `{ bars: { date, open, high, low, close }[] }`.

- [ ] **Step 1: Write the failing tests**

In `api/history.test.ts`, replace the Korean-symbol success test:
```ts
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
```
with:
```ts
  it('routes Korean symbols (.KS) to data.go.kr and maps rows to {date, open, high, low, close} bars, oldest first', async () => {
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
                  { basDt: '20260718', srtnCd: '005930', clpr: '72000', mkp: '71000', hipr: '73000', lopr: '70500' },
                  { basDt: '20260717', srtnCd: '005930', clpr: '71000', mkp: '70000', hipr: '71500', lopr: '69500' },
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
        { date: '2026-07-17', open: 70000, high: 71500, low: 69500, close: 71000 },
        { date: '2026-07-18', open: 71000, high: 73000, low: 70500, close: 72000 },
      ],
    });
  });
```

Replace the non-Korean success test:
```ts
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
```
with:
```ts
  it('routes non-Korean symbols to Twelve Data and maps open/high/low/close, oldest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', open: '7.2', high: '7.45', low: '7.05', close: '7.39' },
            { datetime: '2026-07-17', open: '7.0', high: '7.15', low: '6.95', close: '7.1' },
          ],
        }),
      })
    );
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({
      bars: [
        { date: '2026-07-17', open: 7.0, high: 7.15, low: 6.95, close: 7.1 },
        { date: '2026-07-18', open: 7.2, high: 7.45, low: 7.05, close: 7.39 },
      ],
    });
  });
```

In `src/api/quotes.test.ts`, find any `fetchHistory` mock bodies shaped `{ bars: [{ date, close }] }` and widen them to include `open`/`high`/`low` (e.g. the cache tests' `json: async () => ({ bars: [{ date: '2026-07-17', close: 100 }] })` becomes `json: async () => ({ bars: [{ date: '2026-07-17', open: 99, high: 101, low: 98, close: 100 }] })`) — these tests don't assert on the bar's shape beyond passing it through, so the exact new numbers don't matter, just their presence.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/history.test.ts src/api/quotes.test.ts` (Node 22)
Expected: FAIL — `res.json` was called with only `{date, close}` bars, missing `open`/`high`/`low`.

- [ ] **Step 3: Write the implementation**

Replace `api/history.ts` in full:
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
      res.status(200).json({
        bars: rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.price })),
      });
      return;
    }
    const rows = await twelveDataHistory(symbol);
    res.status(200).json({
      bars: rows.map((r) => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.price })),
    });
  } catch {
    res.status(502).json({ error: 'History lookup failed' });
  }
}
```

In `src/api/quotes.ts`, replace:
```ts
export interface HistoryBar {
  date: string;
  close: number;
}
```
with:
```ts
export interface HistoryBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}
```
(No other changes needed in `quotes.ts` — `fetchHistory` already passes `data.bars` through untyped-cast as `HistoryBar[]`, so the wider interface just applies automatically.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run api/history.test.ts src/api/quotes.test.ts`
Expected: PASS (5 + 10 tests)

- [ ] **Step 5: Commit**

```bash
git add api/history.ts api/history.test.ts src/api/quotes.ts src/api/quotes.test.ts
git commit -m "feat: HistoryBar에 시가/고가/저가 추가 (캔들 렌더링 대비)"
```

---

### Task 4: lightweight-charts v5 upgrade + candlestick price series

**Files:**
- Modify: `package.json`
- Modify: `src/components/PriceChart.tsx`
- Modify: `src/components/PriceChart.test.tsx`
- Modify: `src/components/ChartScreen.test.tsx` (mocks `lightweight-charts` too — same mock shape must update)

**Interfaces:**
- Consumes: `HistoryBar` with `open`/`high`/`low`/`close` (Task 3).
- Produces: `PriceChart` renders candlesticks instead of a line for price. No behavior change to props (`PriceChartProps` unchanged).

This task does the mechanical v5 API migration (`addLineSeries`→`addSeries(LineSeries,...)`, `setMarkers`→`createSeriesMarkers`) and converts the price series to a candlestick, all at once — splitting the dependency bump from its own required code changes isn't possible without leaving the app in a broken, non-compiling state in between. Marker/MA colors stay at their **current** values in this task (blue/red arrows, old MA palette) — the color/shape changes are Task 5, kept separate so this task is purely "migrate the API + add candles," not a mixed refactor+behavior-change diff.

- [ ] **Step 1: Upgrade the dependency**

In `package.json`, change:
```json
    "lightweight-charts": "^4.2.0",
```
to:
```json
    "lightweight-charts": "^5.2.0",
```

Run (Node 22): `npm install`
Expected: `package-lock.json` updates; exits 0. Confirm via `git diff package-lock.json` that only `lightweight-charts` (and any of its own exclusively-owned transitive deps) changed — no unrelated packages added/removed (a past task in an earlier plan on this repo once picked up unrelated stray packages from running `npm install` under the wrong Node version; if you see anything unrelated, stop and flag it rather than committing it).

- [ ] **Step 2: Update both test files' `lightweight-charts` mock**

In `src/components/PriceChart.test.tsx`, replace the top-level mock:
```ts
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() })),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
  LineStyle: { Dashed: 2 },
}));
```
with:
```ts
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
  CandlestickSeries: {},
  LineSeries: {},
  LineStyle: { Dashed: 2 },
}));
```

Apply the identical replacement to the `vi.mock('lightweight-charts', ...)` block in `src/components/ChartScreen.test.tsx` (same old block, same new block, verbatim).

Update the two existing assertions/fixtures in `PriceChart.test.tsx` that reference the old shape:
- `history={[{ date: '2026-01-01', close: 10 }]}` (both tests) → `history={[{ date: '2026-01-01', open: 10, high: 11, low: 9, close: 10 }]}`.
- The second test currently does:
```ts
  it('skips the avg-cost line entirely when avgCost is null (no position yet)', () => {
    const addLineSeriesSpy = vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addLineSeries: addLineSeriesSpy,
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart history={[{ date: '2026-01-01', close: 10 }]} trades={[]} avgCost={null} onPointSelect={() => {}} />
    );

    // price series(1) + 5 moving averages = 6 calls; no 7th call for the avg-cost line.
    expect(addLineSeriesSpy).toHaveBeenCalledTimes(6);
  });
```
Replace it with:
```ts
  it('skips the avg-cost line entirely when avgCost is null (no position yet)', () => {
    const addSeriesSpy = vi.fn(() => ({ setData: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 11, low: 9, close: 10 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    // candlestick price series(1) + 5 moving averages = 6 calls; no 7th call for the avg-cost line.
    expect(addSeriesSpy).toHaveBeenCalledTimes(6);
  });
```

Add a new test confirming the candlestick conversion:
```ts
  it('adds the price series as a candlestick series with OHLC data', () => {
    const addSeriesSpy = vi.fn(() => ({ setData: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    const [seriesType] = addSeriesSpy.mock.calls[0];
    expect(seriesType).toBe(CandlestickSeries);
  });
```
This requires importing `CandlestickSeries` in the test file — add it to the existing `import { createChart } from 'lightweight-charts';` line, making it `import { createChart, CandlestickSeries } from 'lightweight-charts';`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/PriceChart.test.tsx src/components/ChartScreen.test.tsx` (Node 22)
Expected: FAIL — `PriceChart.tsx` still calls `chart.addLineSeries`/`priceSeries.setMarkers`, which don't exist on the new mock shape (and don't exist on the real v5 API either after Step 1's upgrade, so this reproduces a real runtime error, not just a mock mismatch).

- [ ] **Step 4: Rewrite `PriceChart.tsx`**

Replace the file in full:
```tsx
import { useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
} from 'lightweight-charts';
import type { HistoryBar } from '../api/quotes';
import type { Trade } from '../types';
import { simpleMovingAverage } from '../lib/movingAverage';

interface PriceChartProps {
  history: HistoryBar[];
  trades: Trade[];
  avgCost: number | null;
  onPointSelect: (trade: Trade) => void;
}

export function PriceChart({ history, trades, avgCost, onPointSelect }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 300,
      handleScroll: { horzTouchDrag: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#2563eb',
      downColor: '#dc2626',
      borderUpColor: '#2563eb',
      borderDownColor: '#dc2626',
      wickUpColor: '#2563eb',
      wickDownColor: '#dc2626',
    });
    candleSeries.setData(
      history.map((bar) => ({ time: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close }))
    );

    const closeValues = history.map((bar) => bar.close);
    // ADR-0008: MA cap expanded from 1~2 (20/60일) to 5 (5/20/50/100/200일); 20일·200일 emphasized (lineWidth 3 vs 1).
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4 }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1 },
      { window: 20, color: '#f59e0b', lineWidth: 3 },
      { window: 50, color: '#10b981', lineWidth: 1 },
      { window: 100, color: '#6366f1', lineWidth: 1 },
      { window: 200, color: '#dc2626', lineWidth: 3 },
    ];
    for (const ma of MOVING_AVERAGES) {
      const series = chart.addSeries(LineSeries, { color: ma.color, lineWidth: ma.lineWidth });
      series.setData(
        simpleMovingAverage(closeValues, ma.window)
          .map((value, i) => ({ time: history[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
    }

    if (avgCost != null && history.length > 0) {
      const avgCostSeries = chart.addSeries(LineSeries, { color: '#ea580c', lineStyle: LineStyle.Dashed });
      avgCostSeries.setData([
        { time: history[0].date, value: avgCost },
        { time: history[history.length - 1].date, value: avgCost },
      ]);
    }

    createSeriesMarkers(
      candleSeries,
      trades
        .filter((t) => t.datetime)
        .map((t) => ({
          time: (t.datetime as string).slice(0, 10),
          position: t.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.side === 'buy' ? '#2563eb' : '#dc2626',
          shape: t.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
        }))
    );

    chart.subscribeClick((param) => {
      if (!param.time) return;
      const clicked = trades.find((t) => t.datetime?.slice(0, 10) === param.time);
      if (clicked) onPointSelect(clicked);
    });

    return () => chart.remove();
  }, [history, trades, avgCost, onPointSelect]);

  return <div ref={containerRef} data-testid="price-chart" style={{ width: '100%', overflowX: 'auto' }} />;
}
```

(Candle up/down colors are deliberately still blue/red here, matching the OLD marker convention, not the FINAL red-up/blue-down palette — that swap is Task 5, alongside the marker recolor, so this task's diff is pure API-surface migration plus "OHLC candles exist now," nothing else.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/PriceChart.test.tsx src/components/ChartScreen.test.tsx`
Expected: PASS (4 + 7 tests)

Run the full suite and build once (Node 22):
```
npx vitest run
npm run build
```
Expected: all green, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/PriceChart.tsx src/components/PriceChart.test.tsx src/components/ChartScreen.test.tsx
git commit -m "feat: lightweight-charts v5 업그레이드 + 캔들스틱 가격 시리즈로 전환"
```

---

### Task 5: Final candle/MA/marker color palette

**Files:**
- Modify: `src/components/PriceChart.tsx`
- Modify: `src/components/PriceChart.test.tsx`

**Interfaces:**
- Consumes: `CandlestickSeries`/`createSeriesMarkers` from Task 4.

- [ ] **Step 1: Write the failing test**

Add to `PriceChart.test.tsx`:
```ts
  it('uses the final candle/MA color palette and circle markers for trades', () => {
    const addSeriesSpy = vi.fn(() => ({ setData: vi.fn() }));
    const createSeriesMarkersSpy = vi.mocked(createSeriesMarkers);
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[
          {
            id: '1', ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
            datetime: '2026-01-01T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
            price: 11, quantityType: 'shares', quantityValue: 10, quantity: 10,
            fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
            attachment: null, recordedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    const [, candleOptions] = addSeriesSpy.mock.calls[0];
    expect(candleOptions).toMatchObject({ upColor: '#dc2626', downColor: '#2563eb' });

    // Calls: [0]=candle, [1]=MA5, [2]=MA20, [3]=MA50, [4]=MA100, [5]=MA200
    expect(addSeriesSpy.mock.calls[3][1]).toMatchObject({ color: '#8b5cf6' });
    expect(addSeriesSpy.mock.calls[5][1]).toMatchObject({ color: '#0d9488' });

    const [, markers] = createSeriesMarkersSpy.mock.calls[0];
    expect(markers).toEqual([
      expect.objectContaining({ shape: 'circle', color: '#10b981', size: 2 }),
    ]);
  });
```
This requires importing `createSeriesMarkers` in the test file too — update the import line to `import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PriceChart.test.tsx` (Node 22)
Expected: FAIL — candle colors are still blue/red, MA50/MA200 are still the old colors, markers are still arrows.

- [ ] **Step 3: Update the palette in `PriceChart.tsx`**

Replace:
```tsx
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#2563eb',
      downColor: '#dc2626',
      borderUpColor: '#2563eb',
      borderDownColor: '#dc2626',
      wickUpColor: '#2563eb',
      wickDownColor: '#dc2626',
    });
```
with:
```tsx
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#dc2626',
      downColor: '#2563eb',
      borderUpColor: '#dc2626',
      borderDownColor: '#2563eb',
      wickUpColor: '#dc2626',
      wickDownColor: '#2563eb',
    });
```

Replace:
```tsx
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4 }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1 },
      { window: 20, color: '#f59e0b', lineWidth: 3 },
      { window: 50, color: '#10b981', lineWidth: 1 },
      { window: 100, color: '#6366f1', lineWidth: 1 },
      { window: 200, color: '#dc2626', lineWidth: 3 },
    ];
```
with:
```tsx
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4 }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1 },
      { window: 20, color: '#f59e0b', lineWidth: 3 },
      { window: 50, color: '#8b5cf6', lineWidth: 1 },
      { window: 100, color: '#6366f1', lineWidth: 1 },
      { window: 200, color: '#0d9488', lineWidth: 3 },
    ];
```

Replace:
```tsx
    createSeriesMarkers(
      candleSeries,
      trades
        .filter((t) => t.datetime)
        .map((t) => ({
          time: (t.datetime as string).slice(0, 10),
          position: t.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.side === 'buy' ? '#2563eb' : '#dc2626',
          shape: t.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
        }))
    );
```
with:
```tsx
    createSeriesMarkers(
      candleSeries,
      trades
        .filter((t) => t.datetime)
        .map((t) => ({
          time: (t.datetime as string).slice(0, 10),
          position: t.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.side === 'buy' ? '#10b981' : '#a855f7',
          shape: 'circle' as const,
          size: 2,
        }))
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PriceChart.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/PriceChart.tsx src/components/PriceChart.test.tsx
git commit -m "feat: 캔들/이동평균/매매마커 최종 색상 팔레트 적용"
```

---

### Task 6: Dark mode theming + watermark removal + attribution footer

**Files:**
- Modify: `src/components/PriceChart.tsx`
- Modify: `src/components/PriceChart.test.tsx`
- Modify: `src/components/HomeScreen.tsx`
- Modify: `src/components/HomeScreen.test.tsx`

**Interfaces:**
- Produces: `PriceChart` reacts to `document.documentElement`'s `dark` class via `MutationObserver`, calling `chart.applyOptions(...)`.

- [ ] **Step 1: Write the failing tests**

`PriceChart.test.tsx` has no `afterEach` yet. Change its import line from `import { describe, it, expect, vi } from 'vitest';` to `import { describe, it, expect, vi, afterEach } from 'vitest';`, and add this block right after the `vi.mock('lightweight-charts', ...)` call, before the first `describe`:
```ts
afterEach(() => {
  document.documentElement.classList.remove('dark');
});
```

Then add these two tests inside the `describe('PriceChart', ...)` block:
```ts
  it('applies dark theme colors when the html element has the dark class on mount', () => {
    document.documentElement.classList.add('dark');
    const applyOptionsSpy = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: applyOptionsSpy,
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    const [createChartOptions] = vi.mocked(createChart).mock.calls[0].slice(1);
    expect(createChartOptions).toMatchObject({
      layout: { background: { color: '#18181b' }, textColor: '#a1a1aa', attributionLogo: false },
    });
  });

  it('re-themes the chart when the dark class is toggled after mount', async () => {
    const applyOptionsSpy = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: applyOptionsSpy,
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    document.documentElement.classList.add('dark');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(applyOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ layout: expect.objectContaining({ background: { color: '#18181b' } }) })
    );
  });
```

Add to `HomeScreen.test.tsx`:
```ts
  it('shows the lightweight-charts attribution link', () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(<HomeScreen positions={[]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} />);

    const link = screen.getByRole('link', { name: /TradingView Lightweight Charts/ });
    expect(link).toHaveAttribute('href', 'https://www.tradingview.com/');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PriceChart.test.tsx src/components/HomeScreen.test.tsx` (Node 22)
Expected: FAIL — `createChart` isn't called with any `layout` options yet; no `applyOptions` call happens on class toggle; no attribution link exists in `HomeScreen`.

- [ ] **Step 3: Add theming to `PriceChart.tsx`**

Add above the `PriceChart` function:
```tsx
function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

function themeOptions(isDark: boolean) {
  return isDark
    ? {
        layout: { background: { color: '#18181b' }, textColor: '#a1a1aa', attributionLogo: false },
        grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      }
    : {
        layout: { background: { color: '#ffffff' }, textColor: '#71717a', attributionLogo: false },
        grid: { vertLines: { color: '#e5e7eb' }, horzLines: { color: '#e5e7eb' } },
      };
}
```

Replace:
```tsx
    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 300,
      handleScroll: { horzTouchDrag: true },
    });
```
with:
```tsx
    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 300,
      handleScroll: { horzTouchDrag: true },
      ...themeOptions(isDarkMode()),
    });
```

Replace the effect's `return () => chart.remove();` with:
```tsx
    const themeObserver = new MutationObserver(() => {
      chart.applyOptions(themeOptions(isDarkMode()));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      themeObserver.disconnect();
      chart.remove();
    };
```

- [ ] **Step 4: Add the attribution link to `HomeScreen.tsx`**

At the very end of the returned JSX, immediately before the closing `</div>` of the top-level `<div className="mx-auto flex max-w-md flex-col gap-4 p-4">`, add:
```tsx
      <a
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noreferrer"
        className="text-center text-[0.65rem] text-zinc-400 dark:text-zinc-600"
      >
        Powered by TradingView Lightweight Charts
      </a>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/PriceChart.test.tsx src/components/HomeScreen.test.tsx`
Expected: PASS (7 + 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/PriceChart.tsx src/components/PriceChart.test.tsx src/components/HomeScreen.tsx src/components/HomeScreen.test.tsx
git commit -m "feat: 차트 다크모드 대응 + 워터마크 제거 + 대체 저작권 표기 추가"
```

---

### Task 7: Moving-average legend

**Files:**
- Modify: `src/components/PriceChart.tsx`
- Modify: `src/components/PriceChart.test.tsx`

**Interfaces:**
- Produces: a `data-testid="ma-legend"` element listing each MA's period + latest value, present alongside the chart container.

- [ ] **Step 1: Write the failing test**

Add to `PriceChart.test.tsx`:
```ts
  it('renders a moving-average legend with period and latest value, color-matched', () => {
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    const history = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-0${i + 1}`,
      open: 10,
      high: 10,
      low: 10,
      close: 10 + i,
    }));

    render(<PriceChart history={history} trades={[]} avgCost={null} onPointSelect={() => {}} />);

    const legend = screen.getByTestId('ma-legend');
    // 5-day MA over closes [10,11,12,13,14] = 12, on the only day it has enough data (the 5th bar).
    expect(legend).toHaveTextContent('5일');
    expect(legend).toHaveTextContent('12');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PriceChart.test.tsx` (Node 22)
Expected: FAIL — no element with `data-testid="ma-legend"` exists.

- [ ] **Step 3: Implement the legend**

Add `useState` to the import: change `import { useEffect, useRef } from 'react';` to `import { useEffect, useRef, useState } from 'react';`.

Add a label to each MA definition and track legend state. Replace:
```tsx
    const closeValues = history.map((bar) => bar.close);
    // ADR-0008: MA cap expanded from 1~2 (20/60일) to 5 (5/20/50/100/200일); 20일·200일 emphasized (lineWidth 3 vs 1).
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4 }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1 },
      { window: 20, color: '#f59e0b', lineWidth: 3 },
      { window: 50, color: '#8b5cf6', lineWidth: 1 },
      { window: 100, color: '#6366f1', lineWidth: 1 },
      { window: 200, color: '#0d9488', lineWidth: 3 },
    ];
    for (const ma of MOVING_AVERAGES) {
      const series = chart.addSeries(LineSeries, { color: ma.color, lineWidth: ma.lineWidth });
      series.setData(
        simpleMovingAverage(closeValues, ma.window)
          .map((value, i) => ({ time: history[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
    }
```
with:
```tsx
    const closeValues = history.map((bar) => bar.close);
    // ADR-0008: MA cap expanded from 1~2 (20/60일) to 5 (5/20/50/100/200일); 20일·200일 emphasized (lineWidth 3 vs 1).
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4; label: string }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1, label: '5일' },
      { window: 20, color: '#f59e0b', lineWidth: 3, label: '20일' },
      { window: 50, color: '#8b5cf6', lineWidth: 1, label: '50일' },
      { window: 100, color: '#6366f1', lineWidth: 1, label: '100일' },
      { window: 200, color: '#0d9488', lineWidth: 3, label: '200일' },
    ];
    const legendEntries: { label: string; color: string; value: number }[] = [];
    for (const ma of MOVING_AVERAGES) {
      const series = chart.addSeries(LineSeries, { color: ma.color, lineWidth: ma.lineWidth });
      const maValues = simpleMovingAverage(closeValues, ma.window);
      series.setData(
        maValues
          .map((value, i) => ({ time: history[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
      const latest = [...maValues].reverse().find((value): value is number => value != null);
      if (latest != null) {
        legendEntries.push({ label: ma.label, color: ma.color, value: latest });
      }
    }
    setLegend(legendEntries);
```

Add the state declaration at the top of the component body:
```tsx
  const [legend, setLegend] = useState<{ label: string; color: string; value: number }[]>([]);
```

Replace the final return statement:
```tsx
  return <div ref={containerRef} data-testid="price-chart" style={{ width: '100%', overflowX: 'auto' }} />;
```
with:
```tsx
  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} data-testid="price-chart" style={{ width: '100%', overflowX: 'auto' }} />
      <div
        data-testid="ma-legend"
        style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.65rem', textAlign: 'right', pointerEvents: 'none' }}
      >
        {legend.map((entry) => (
          <div key={entry.label} style={{ color: entry.color }}>
            {entry.label} {entry.value}
          </div>
        ))}
      </div>
    </div>
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PriceChart.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/PriceChart.tsx src/components/PriceChart.test.tsx
git commit -m "feat: 이동평균선 범례(기간+현재값) 추가"
```

---

### Task 8: Independent time/price zoom

**Files:**
- Modify: `src/components/PriceChart.tsx`
- Modify: `src/components/PriceChart.test.tsx`

**Interfaces:**
- Consumes: `chart.priceScale('right').width()`, `chart.timeScale().setVisibleLogicalRange()`/`.getVisibleLogicalRange()`, `priceScale.setAutoScale()`/`.setVisibleRange()`/`.getVisibleRange()` (all v5 APIs from Task 4's upgrade).

Touch-start position decides which axis (if any) a drag zooms: the rightmost `priceScale('right').width()` pixels of the container are the price-axis region; the bottom 28px are the time-axis region (an approximation — there's no direct public API for the time axis's rendered height the way there is `priceScale().width()`; 28px matches the default `fontSize: 12` axis label row plus padding, and is the kind of constant that may need visual tuning against the real rendered chart, not just this test suite). Everything else is left to the library's existing pan/pinch handling, untouched.

- [ ] **Step 1: Write the failing tests**

Add to `PriceChart.test.tsx`:
```ts
  it('zooms only the price scale when a touch drag starts in the price-axis region', () => {
    const setAutoScale = vi.fn();
    const setVisibleRange = vi.fn();
    const getVisibleRange = vi.fn(() => ({ from: 0, to: 100 }));
    const priceScale = vi.fn(() => ({ width: () => 50, setAutoScale, setVisibleRange, getVisibleRange }));
    let containerEl!: HTMLDivElement;
    vi.mocked(createChart).mockImplementation((el) => {
      containerEl = el as HTMLDivElement;
      return {
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        applyOptions: vi.fn(),
        subscribeClick: vi.fn(),
        priceScale,
        timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 10 })) })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>;
    });

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    // jsdom's getBoundingClientRect() always returns zeros regardless of clientWidth/clientHeight —
    // mock it directly so the region-detection math in PriceChart has real width/height to work with.
    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON: () => '',
    });

    // Touch starting inside the rightmost 50px (the price-scale width) at y=100 (not in the bottom 28px).
    const touchStart = new Event('touchstart', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 280, clientY: 100 }] });
    containerEl.dispatchEvent(touchStart);

    const touchMove = new Event('touchmove', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchMove, 'touches', { value: [{ clientX: 280, clientY: 60 }] });
    containerEl.dispatchEvent(touchMove);

    expect(setAutoScale).toHaveBeenCalledWith(false);
    expect(setVisibleRange).toHaveBeenCalled();
  });

  it('zooms only the time scale when a touch drag starts in the time-axis region', () => {
    const setVisibleLogicalRange = vi.fn();
    const getVisibleLogicalRange = vi.fn(() => ({ from: 0, to: 10 }));
    let containerEl!: HTMLDivElement;
    vi.mocked(createChart).mockImplementation((el) => {
      containerEl = el as HTMLDivElement;
      return {
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        applyOptions: vi.fn(),
        subscribeClick: vi.fn(),
        priceScale: vi.fn(() => ({ width: () => 50, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
        timeScale: vi.fn(() => ({ setVisibleLogicalRange, getVisibleLogicalRange })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>;
    });

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON: () => '',
    });

    // Touch starting in the bottom 28px (time-axis region), away from the right price-scale column.
    const touchStart = new Event('touchstart', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 100, clientY: 290 }] });
    containerEl.dispatchEvent(touchStart);

    const touchMove = new Event('touchmove', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchMove, 'touches', { value: [{ clientX: 160, clientY: 290 }] });
    containerEl.dispatchEvent(touchMove);

    expect(setVisibleLogicalRange).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PriceChart.test.tsx` (Node 22)
Expected: FAIL — no touch listeners are attached yet, so neither spy is called.

- [ ] **Step 3: Implement region-based touch zoom**

Add this block right before `chart.subscribeClick(...)`  in `PriceChart.tsx`:
```tsx
    const rightScale = chart.priceScale('right');
    const timeScale = chart.timeScale();
    const TIME_AXIS_HEIGHT = 28;

    let dragMode: 'price' | 'time' | null = null;
    let dragStart: { x: number; y: number } | null = null;
    let dragStartPriceRange: { from: number; to: number } | null = null;
    let dragStartLogicalRange: { from: number; to: number } | null = null;

    function handleTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (x >= rect.width - rightScale.width()) {
        dragMode = 'price';
        rightScale.setAutoScale(false);
        dragStartPriceRange = rightScale.getVisibleRange();
      } else if (y >= rect.height - TIME_AXIS_HEIGHT) {
        dragMode = 'time';
        dragStartLogicalRange = timeScale.getVisibleLogicalRange();
      } else {
        dragMode = null;
      }
      dragStart = { x, y };
    }

    function handleTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch || !dragMode || !dragStart) return;
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (dragMode === 'price' && dragStartPriceRange) {
        const deltaY = y - dragStart.y;
        const scale = 1 + deltaY / rect.height;
        const mid = (dragStartPriceRange.from + dragStartPriceRange.to) / 2;
        const halfSpan = ((dragStartPriceRange.to - dragStartPriceRange.from) / 2) * scale;
        rightScale.setVisibleRange({ from: mid - halfSpan, to: mid + halfSpan });
      } else if (dragMode === 'time' && dragStartLogicalRange) {
        const deltaX = x - dragStart.x;
        const scale = 1 + deltaX / rect.width;
        const mid = (dragStartLogicalRange.from + dragStartLogicalRange.to) / 2;
        const halfSpan = ((dragStartLogicalRange.to - dragStartLogicalRange.from) / 2) * scale;
        timeScale.setVisibleLogicalRange({ from: mid - halfSpan, to: mid + halfSpan });
      }
    }

    function handleTouchEnd() {
      dragMode = null;
      dragStart = null;
      dragStartPriceRange = null;
      dragStartLogicalRange = null;
    }

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove);
    container.addEventListener('touchend', handleTouchEnd);
```

Update the cleanup function to also remove these listeners:
```tsx
    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      themeObserver.disconnect();
      chart.remove();
    };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PriceChart.test.tsx`
Expected: PASS (10 tests)

Run the full suite once (Node 22): `npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/PriceChart.tsx src/components/PriceChart.test.tsx
git commit -m "feat: 가격축/시간축 독립 터치 확대축소 추가"
```

---

### Task 9: Inline trade list + modal trade detail

**Files:**
- Modify: `src/components/ChartScreen.tsx`
- Modify: `src/components/ChartScreen.test.tsx`

**Interfaces:**
- Consumes: `TradeList`, `TradeBottomSheet` (both unchanged in this task — `TradeBottomSheet` already renders `role="dialog" aria-label="매매 상세"` internally, it's only ever been missing the overlay wrapper around it).

- [ ] **Step 1: Rewrite the failing tests**

In `ChartScreen.test.tsx`, remove the entire "매매 목록" flow test:
```ts
  it("opens the trade-list sheet and shows a saved trade's detail on selection", async () => {
    await createTrade(db, {
      ticker: 'JOBY',
      market: 'US',
      name: '조비',
      currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z',
      datetimeUnknown: false,
      side: 'buy',
      price: 11.36,
      quantityType: 'shares',
      quantityValue: 100,
      fxRateAtTrade: null,
      rationaleTagIds: [],
      conviction: null,
      memo: '',
      attachment: null,
    });

    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[item()]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: '매매 목록' }));
    await screen.findByRole('dialog', { name: '매매 목록 시트' });
    await userEvent.click(await screen.findByRole('button', { name: /매수 11.36/ }));

    expect(await screen.findByRole('dialog', { name: '매매 상세' })).toBeInTheDocument();
  });
```
Replace it with:
```ts
  it("shows the trade list inline (no button/sheet needed) and opens a trade's detail as a modal on selection", async () => {
    await createTrade(db, {
      ticker: 'JOBY',
      market: 'US',
      name: '조비',
      currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z',
      datetimeUnknown: false,
      side: 'buy',
      price: 11.36,
      quantityType: 'shares',
      quantityValue: 100,
      fxRateAtTrade: null,
      rationaleTagIds: [],
      conviction: null,
      memo: '',
      attachment: null,
    });

    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[item()]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: '매매 목록' })).not.toBeInTheDocument();
    const tradeRow = await screen.findByRole('button', { name: /매수 11.36/ });

    await userEvent.click(tradeRow);

    const dialog = await screen.findByRole('dialog', { name: '매매 상세' });
    expect(dialog.parentElement).toHaveClass('fixed', 'inset-0');
  });
```

Update the still-relevant stale-response test, which also opens the list sheet:
```ts
    bTrades.resolve([tradeFixture({ ticker: 'JOBY', price: 22.5 })]);
    await userEvent.click(await screen.findByRole('button', { name: '매매 목록' }));
    await screen.findByRole('dialog', { name: '매매 목록 시트' });
    expect(await screen.findByRole('button', { name: /매수 22.5/ })).toBeInTheDocument();
```
becomes:
```ts
    bTrades.resolve([tradeFixture({ ticker: 'JOBY', price: 22.5 })]);
    expect(await screen.findByRole('button', { name: /매수 22.5/ })).toBeInTheDocument();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ChartScreen.test.tsx` (Node 22)
Expected: FAIL — the "매매 목록" button and its sheet still exist and gate the list; the trade-detail dialog still renders without a `fixed inset-0` wrapper.

- [ ] **Step 3: Rewrite `ChartScreen.tsx`**

Remove the `showListSheet` state. Replace:
```tsx
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showListSheet, setShowListSheet] = useState(false);
```
with:
```tsx
  const [showAddSheet, setShowAddSheet] = useState(false);
```

Replace:
```tsx
  useEffect(() => {
    activeTickerRef.current = ticker;
    setShowAddSheet(false);
    setShowListSheet(false);
    setSelected(null);
```
with:
```tsx
  useEffect(() => {
    activeTickerRef.current = ticker;
    setShowAddSheet(false);
    setSelected(null);
```

Replace the two-button action row:
```tsx
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowAddSheet(true)}
          className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98]"
        >
          + 매매 기록 추가
        </button>
        <button
          type="button"
          onClick={() => setShowListSheet(true)}
          className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-900 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        >
          매매 목록
        </button>
      </div>
```
with:
```tsx
      <button
        type="button"
        onClick={() => setShowAddSheet(true)}
        className="rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98]"
      >
        + 매매 기록 추가
      </button>

      <TradeList trades={trades} tags={tags} onSelect={setSelected} />
```

Remove the list-sheet block entirely:
```tsx
      {showListSheet && (
        <div className="fixed inset-0 z-20 flex items-end bg-zinc-900/40">
          <div
            role="dialog"
            aria-label="매매 목록 시트"
            className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-zinc-900"
          >
            <button
              type="button"
              onClick={() => setShowListSheet(false)}
              className="mb-2 rounded-xl px-3 py-1 text-sm text-zinc-500 dark:text-zinc-400"
            >
              닫기
            </button>
            <TradeList trades={trades} tags={tags} onSelect={setSelected} />
          </div>
        </div>
      )}

      {selected && <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />}
```
with:
```tsx
      {selected && (
        <div className="fixed inset-0 z-20 flex items-end bg-zinc-900/40">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl">
            <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ChartScreen.test.tsx`
Expected: PASS (7 tests)

Run the full suite once (Node 22): `npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/ChartScreen.tsx src/components/ChartScreen.test.tsx
git commit -m "feat: 매매 목록 인라인화 + 매매내역 팝업(모달)화"
```

---

### Task 10: Trade-list memo clamp + expand/collapse

**Files:**
- Modify: `src/components/TradeList.tsx`
- Modify: `src/components/TradeList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace `TradeList.test.tsx` in full:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeList } from './TradeList';
import type { Trade } from '../types';

const trade: Trade = {
  id: '1', ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
  datetime: '2025-10-15T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
  price: 16.3, quantityType: 'shares', quantityValue: 50, quantity: 50,
  fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
  attachment: null, recordedAt: '2025-10-15T00:05:00.000Z',
};

describe('TradeList', () => {
  it('renders one row per trade and reports the clicked trade', async () => {
    const onSelect = vi.fn();
    render(<TradeList trades={[trade]} tags={[]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /2025-10-15/ }));
    expect(onSelect).toHaveBeenCalledWith(trade);
  });

  it('shows no memo preview or 더보기 button when the trade has no memo', () => {
    render(<TradeList trades={[trade]} tags={[]} onSelect={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument();
  });

  it('clamps a long memo to 3 lines and expands/collapses it via 더보기/접기', async () => {
    const longMemo = '이 매매는 실적발표 직전에 진입했고, 이후 변동성이 커질 것으로 예상했다. 장기 보유 관점에서 접근했다.';
    render(<TradeList trades={[{ ...trade, memo: longMemo }]} tags={[]} onSelect={vi.fn()} />);

    const preview = screen.getByText(longMemo);
    expect(preview).toHaveClass('line-clamp-3');

    await userEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(screen.getByText(longMemo)).not.toHaveClass('line-clamp-3');
    expect(screen.getByRole('button', { name: '접기' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '접기' }));
    expect(screen.getByText(longMemo)).toHaveClass('line-clamp-3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/TradeList.test.tsx` (Node 22)
Expected: FAIL — no memo is rendered in the list at all today, so neither the clamp nor the 더보기/접기 buttons exist.

- [ ] **Step 3: Implement memo preview + expand/collapse**

Replace `TradeList.tsx` in full:
```tsx
import { useState } from 'react';
import type { Tag, Trade } from '../types';

interface TradeListProps {
  trades: Trade[];
  tags: Tag[];
  onSelect: (trade: Trade) => void;
}

function TradeRow({ trade, tags, onSelect }: { trade: Trade; tags: Tag[]; onSelect: (trade: Trade) => void }) {
  const [expanded, setExpanded] = useState(false);
  const tagNames = trade.rationaleTagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const dateLabel = (trade.datetime ?? '날짜 모름').slice(0, 10);
  const rationaleLabel = tagNames.length > 0 ? tagNames.join(', ') : '이 매매, 기억나는 이유가 있나요?';

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(trade)}
        className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {dateLabel} · {trade.side === 'buy' ? '매수' : '매도'} {trade.price} · {rationaleLabel}
      </button>
      {trade.memo && (
        <div className="px-3 pb-2">
          <p className={expanded ? 'text-xs text-zinc-500 dark:text-zinc-400' : 'line-clamp-3 text-xs text-zinc-500 dark:text-zinc-400'}>
            {trade.memo}
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
            className="mt-1 text-xs font-bold text-accent"
          >
            {expanded ? '접기' : '더보기'}
          </button>
        </div>
      )}
    </li>
  );
}

export function TradeList({ trades, tags, onSelect }: TradeListProps) {
  return (
    <ul aria-label="매매 목록" className="flex flex-col gap-1">
      {trades.map((trade) => (
        <TradeRow key={trade.id} trade={trade} tags={tags} onSelect={onSelect} />
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/TradeList.test.tsx`
Expected: PASS (3 tests)

Run the full suite and build once (Node 22):
```
npx vitest run
npm run build
```
Expected: all green, build exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/TradeList.tsx src/components/TradeList.test.tsx
git commit -m "feat: 매매 목록 메모 3줄 클램프 + 더보기/접기 추가"
```
