# Chart Timeframe Tabs (일/주/월/년) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user switch `PriceChart` between 일/주/월/년 candles — real re-aggregated OHLC bars per period (Korean-app convention), computed client-side from already-fetched daily history, with moving averages, trade arrows, and the avg-cost line all following the active period.

**Architecture:** A new pure aggregation function (`src/lib/aggregateBars.ts`) groups daily `HistoryBar[]` into weekly/monthly/yearly buckets. `PriceChart.tsx` gains a `period` state and a tab row, feeds the aggregated bars into the candle series/moving averages/arrow-bucketing instead of the raw daily bars, and lets its existing per-render effect (which already fully tears down and recreates the chart on any dependency change) handle "reset zoom on period change" for free. Both history-fetching backends (`api/_lib/dataGoKr.ts`, `api/_lib/twelveData.ts`) widen their lookback window so 월봉/년봉 have enough candles to be useful.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Testing Library, lightweight-charts v5, Vercel serverless functions.

## Global Constraints

- Aggregation is entirely client-side, computed from data already fetched by `fetchHistory` — switching tabs must not trigger a new network request.
- Default tab on mount: 일봉 (identity — must be byte-for-byte the same behavior as today).
- Week buckets are Monday-start (Korean convention). Month buckets are calendar months. Year buckets are calendar years.
- Each aggregated bar: `open` = first bar in the bucket's `open`, `close` = last bar's `close`, `high`/`low` = max/min across the bucket, `date` = the bucket's first actual trading day (not a synthetic calendar boundary).
- Moving averages (5/20/50/100/200) recompute against the active period's aggregated closes; their legend labels read e.g. "5주"/"20주" in weekly view, not "5일".
- Trade arrows map to the aggregated bucket containing the trade's date, keeping the existing same-bucket ×N grouping.
- Twelve Data (`twelveDataHistory`): `outputsize` goes from `'365'` to `'5000'`.
- data.go.kr (`dataGoKrHistory`): lookback window goes from 1 year to 20 years, with real pagination (today it only ever fetches page 1).
- Node 22 is required for all test/build commands: `source ~/.nvm/nvm.sh && nvm use 22`. Run both `npx vitest run` AND `npm run build` before considering any task done.
- Branch: `feature/chart-timeframe-tabs`, based on current `master`.

---

### Task 1: aggregateBars — pure aggregation function

**Files:**
- Create: `src/lib/aggregateBars.ts`
- Test: `src/lib/aggregateBars.test.ts`

**Interfaces:**
- Produces: `type AggregationPeriod = 'day' | 'week' | 'month' | 'year'` and `aggregateBars(bars: HistoryBar[], period: AggregationPeriod): HistoryBar[]`, both exported. Consumed by Task 4's `PriceChart.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/aggregateBars.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/lib/aggregateBars.test.ts
```

Expected: FAIL — `./aggregateBars` module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `src/lib/aggregateBars.ts`:

```ts
import type { HistoryBar } from '../api/quotes';

export type AggregationPeriod = 'day' | 'week' | 'month' | 'year';

function bucketKey(date: string, period: AggregationPeriod): string {
  if (period === 'year') return date.slice(0, 4);
  if (period === 'month') return date.slice(0, 7);
  // week: Monday-start (Korean convention). getUTCDay(): 0=Sun..6=Sat;
  // convert to days-since-Monday (Mon=0 .. Sun=6) and step back to that Monday.
  const d = new Date(`${date}T00:00:00Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

export function aggregateBars(bars: HistoryBar[], period: AggregationPeriod): HistoryBar[] {
  if (period === 'day') return bars;

  const buckets = new Map<string, HistoryBar[]>();
  for (const bar of bars) {
    const key = bucketKey(bar.date, period);
    const group = buckets.get(key);
    if (group) {
      group.push(bar);
    } else {
      buckets.set(key, [bar]);
    }
  }

  return [...buckets.values()].map((group) => ({
    date: group[0].date,
    open: group[0].open,
    close: group[group.length - 1].close,
    high: Math.max(...group.map((b) => b.high)),
    low: Math.min(...group.map((b) => b.low)),
  }));
}
```

(`buckets` is a `Map`, which iterates in insertion order; since `bars` is always oldest-first and each bucket's first-seen bar determines its position, the returned array stays oldest-first with no extra sort needed. The bucket's own `date` is `group[0].date` — the bucket's actual first trading day, not the Monday/1st-of-month/Jan-1 key used only for grouping, since a holiday can shift the real first trading day later than the calendar boundary.)

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/lib/aggregateBars.test.ts
npm run build
```

Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aggregateBars.ts src/lib/aggregateBars.test.ts
git commit -m "feat: 일봉을 주/월/년 단위로 집계하는 aggregateBars 함수 추가"
```

---

### Task 2: dataGoKrHistory — pagination + 20-year lookback

**Files:**
- Modify: `api/_lib/dataGoKr.ts`
- Test: `api/_lib/dataGoKr.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `dataGoKrHistory`'s external signature/return shape is unchanged — only its internal fetching behavior changes (more rows, more history). `dataGoKrFetch`'s internal return type changes from `DataGoKrStockPriceRow[]` to `{ rows: DataGoKrStockPriceRow[]; totalCount: number }` — this is a private helper, its only other caller (`dataGoKrQuote`) is updated in this same task.

- [ ] **Step 1: Write the failing tests**

Add to `api/_lib/dataGoKr.test.ts`. First add a second response-builder helper (the existing `okResponse` always sets `totalCount: items.length`, which can't simulate "more pages exist"):

```ts
function pageResponse(
  items: { basDt: string; srtnCd: string; clpr: string; mkp?: string; hipr?: string; lopr?: string }[],
  totalCount: number
) {
  return {
    ok: true,
    json: async () => ({
      response: {
        header: { resultCode: '00', resultMsg: 'OK' },
        body: {
          items: items.length === 0 ? '' : { item: items },
          numOfRows: items.length,
          pageNo: 1,
          totalCount,
        },
      },
    }),
  };
}
```

Add these tests inside `describe('dataGoKrHistory', ...)`:

```ts
  it('fetches a second page when totalCount exceeds the first page\'s row count', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        pageResponse([{ basDt: '20260717', srtnCd: '005930', clpr: '100', mkp: '99', hipr: '101', lopr: '98' }], 2)
      )
      .mockResolvedValueOnce(
        pageResponse([{ basDt: '20260718', srtnCd: '005930', clpr: '102', mkp: '100', hipr: '103', lopr: '99' }], 2)
      );
    vi.stubGlobal('fetch', fetchMock);

    const bars = await dataGoKrHistory('005930.KS');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bars).toEqual([
      { date: '2026-07-17', open: 99, high: 101, low: 98, price: 100 },
      { date: '2026-07-18', open: 100, high: 103, low: 99, price: 102 },
    ]);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain('pageNo=2');
  });

  it('stops after one page when totalCount fits in the first page', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        pageResponse([{ basDt: '20260717', srtnCd: '005930', clpr: '100', mkp: '99', hipr: '101', lopr: '98' }], 1)
      );
    vi.stubGlobal('fetch', fetchMock);
    await dataGoKrHistory('005930.KS');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests a lookback window of roughly 20 years', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pageResponse([], 0));
    vi.stubGlobal('fetch', fetchMock);
    await dataGoKrHistory('005930.KS');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    const beginYear = Number(url.searchParams.get('beginBasDt')!.slice(0, 4));
    const endYear = new Date().getFullYear();
    expect(endYear - beginYear).toBeGreaterThanOrEqual(19);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run api/_lib/dataGoKr.test.ts
```

Expected: the 3 new tests FAIL — today's `dataGoKrHistory` only ever calls `fetch` once (regardless of `totalCount`) and looks back only 1 year.

- [ ] **Step 3: Implement**

In `api/_lib/dataGoKr.ts`, change `dataGoKrFetch` to also return `totalCount`:

```ts
async function dataGoKrFetch(
  params: Record<string, string>
): Promise<{ rows: DataGoKrStockPriceRow[]; totalCount: number }> {
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
  const rows = !items || typeof items === 'string' ? [] : items.item;
  return { rows, totalCount: data.response.body?.totalCount ?? 0 };
}
```

Update `dataGoKrQuote` (its only other caller) to destructure `.rows`:

```ts
export async function dataGoKrQuote(symbol: string): Promise<{ symbol: string; price: number }> {
  const { rows } = await dataGoKrFetch({ likeSrtnCd: stripKrSuffix(symbol), numOfRows: '10', pageNo: '1' });
  if (!rows[0]) throw new Error(`data.go.kr quote returned no data for ${symbol}`);
  const latest = rows.reduce((max, r) => (r.basDt > max.basDt ? r : max));
  return { symbol, price: Number(latest.clpr.replace(/,/g, '')) };
}
```

Replace `dataGoKrHistory` with a paginating version, widening the lookback to 20 years:

```ts
export async function dataGoKrHistory(
  symbol: string
): Promise<{ date: string; open: number; high: number; low: number; price: number }[]> {
  const to = new Date();
  const from = new Date(to);
  from.setFullYear(from.getFullYear() - 20);
  const numOfRows = 1000;
  const rows: DataGoKrStockPriceRow[] = [];

  // 50 pages * 1000 rows = 50,000 rows is far beyond 20 years of trading days
  // (~5,000) - this bound only guards against a pathological API response,
  // it is never expected to be hit in practice.
  for (let pageNo = 1; pageNo <= 50; pageNo++) {
    const page = await dataGoKrFetch({
      likeSrtnCd: stripKrSuffix(symbol),
      beginBasDt: formatBasDt(from),
      endBasDt: formatBasDt(to),
      numOfRows: String(numOfRows),
      pageNo: String(pageNo),
    });
    rows.push(...page.rows);
    if (page.rows.length === 0 || rows.length >= page.totalCount) break;
  }

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

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run api/_lib/dataGoKr.test.ts
npm run build
```

Expected: PASS (all pre-existing `dataGoKrHistory`/`dataGoKrQuote` tests too — their shared `okResponse` helper always sets `totalCount: items.length`, so the pagination loop still terminates after exactly one page for every one of them). Build clean.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/dataGoKr.ts api/_lib/dataGoKr.test.ts
git commit -m "feat: dataGoKrHistory 페이지네이션 추가, 조회 기간 20년으로 확장"
```

---

### Task 3: twelveDataHistory — expand outputsize

**Files:**
- Modify: `api/_lib/twelveData.ts`
- Test: `api/_lib/twelveData.test.ts`

**Interfaces:**
- Consumes/produces: nothing new — `twelveDataHistory`'s signature and behavior are unchanged except for how much history a single call returns.

- [ ] **Step 1: Write the failing test**

Add to `api/_lib/twelveData.test.ts`, inside `describe('twelveDataHistory', ...)`:

```ts
  it('requests a large outputsize so a single call covers many years of history', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ values: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataHistory('JOBY');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('outputsize')).toBe('5000');
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run api/_lib/twelveData.test.ts
```

Expected: FAIL — current `outputsize` is `'365'`.

- [ ] **Step 3: Implement**

In `api/_lib/twelveData.ts`, change `twelveDataHistory`'s `outputsize`:

```ts
export async function twelveDataHistory(
  symbol: string
): Promise<{ date: string; open: number; high: number; low: number; price: number }[]> {
  const data = (await twelveDataFetch('time_series', {
    symbol,
    interval: '1day',
    outputsize: '5000',
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

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run api/_lib/twelveData.test.ts
npm run build
```

Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/twelveData.ts api/_lib/twelveData.test.ts
git commit -m "feat: twelveDataHistory outputsize 확장 (365 -> 5000)"
```

---

### Task 4: PriceChart — 일/주/월/년 tabs, aggregation wiring, arrow rebucketing

**Files:**
- Modify: `src/components/PriceChart.tsx`
- Test: `src/components/PriceChart.test.tsx`

**Interfaces:**
- Consumes: `aggregateBars(bars, period)` and `type AggregationPeriod` from Task 1's `src/lib/aggregateBars.ts`.
- Produces: no new external props — `PriceChart`'s own props (`history`, `trades`, `avgCost`, `onPointSelect`) are unchanged; aggregation is entirely internal, so `ChartScreen.tsx`/`App.tsx` need no changes at all.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/PriceChart.test.tsx`. First add the import:

```tsx
import userEvent from '@testing-library/user-event';
```

(add this alongside the existing `@testing-library/react` import at the top of the file)

Then add these tests inside the existing `describe('PriceChart', ...)` block:

```tsx
  it('shows 일/주/월/년 tabs, defaulting to 일 (daily, unchanged bars)', () => {
    render(
      <PriceChart
        history={[{ date: '2026-07-17', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '일' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '주' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('aggregates into weekly candles when the 주 tab is clicked', async () => {
    const candleSetData = vi.fn();
    const addSeriesSpy = vi.fn((seriesType?: unknown, _options?: unknown) =>
      seriesType === CandlestickSeries ? { setData: candleSetData } : { setData: vi.fn() }
    );
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[
          { date: '2026-07-13', open: 100, high: 105, low: 99, close: 102 },
          { date: '2026-07-14', open: 102, high: 108, low: 101, close: 106 },
          { date: '2026-07-20', open: 107, high: 112, low: 106, close: 110 },
        ]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '주' }));

    expect(candleSetData).toHaveBeenLastCalledWith([
      { time: '2026-07-13', open: 100, high: 108, low: 99, close: 106 },
      { time: '2026-07-20', open: 107, high: 112, low: 106, close: 110 },
    ]);
  });

  it('computes the moving-average legend from weekly closes when the 주 tab is active', async () => {
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    // One bar per Monday, 5 consecutive weeks - closes [10,11,12,13,14], same
    // shape as the existing daily 5-MA legend test, but one bar = one week.
    const history = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 6, 13 + i * 7)).toISOString().slice(0, 10),
      open: 10,
      high: 10,
      low: 10,
      close: 10 + i,
    }));

    render(<PriceChart history={history} trades={[]} avgCost={null} onPointSelect={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '주' }));

    const legend = await screen.findByTestId('ma-legend');
    expect(legend).toHaveTextContent('5주');
    expect(legend).toHaveTextContent('12');
  });

  it('buckets a trade arrow by its aggregated (weekly) candle, not its exact daily date', async () => {
    const timeToCoordinate = vi.fn((time: string) => (time === '2026-07-13' ? 50 : null));
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    const history = [
      { date: '2026-07-13', open: 10, high: 12, low: 9, close: 11 }, // Monday, week-bucket start
      { date: '2026-07-14', open: 11, high: 13, low: 10, close: 12 }, // Tuesday, same week
    ];
    const trade = {
      id: '1', ticker: 'JOBY', market: 'US' as const, name: '조비', currency: 'USD' as const,
      datetime: '2026-07-14T00:00:00.000Z', datetimeUnknown: false, side: 'buy' as const,
      price: 12, quantityType: 'shares' as const, quantityValue: 10, quantity: 10,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
      attachment: null, recordedAt: '2026-07-14T00:00:00.000Z',
    };

    render(<PriceChart history={history} trades={[trade]} avgCost={null} onPointSelect={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '주' }));

    // The trade happened Tuesday 07-14, but the weekly bucket containing it
    // starts Monday 07-13 - the arrow must be looked up (and rendered) at
    // that bucket's date, not the trade's own exact day.
    expect(await screen.findByRole('button', { name: '매수 2026-07-13' })).toBeInTheDocument();
    expect(timeToCoordinate).toHaveBeenCalledWith('2026-07-13');
  });

  it('fully recreates the chart (resetting any zoom/pan) when the period tab changes', async () => {
    const firstRemove = vi.fn();
    const secondRemove = vi.fn();
    let callCount = 0;
    vi.mocked(createChart).mockImplementation(() => {
      callCount += 1;
      return {
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        applyOptions: vi.fn(),
        priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
        timeScale: vi.fn(() => ({
          setVisibleLogicalRange: vi.fn(),
          getVisibleLogicalRange: vi.fn(),
          timeToCoordinate: vi.fn(() => null),
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        })),
        remove: callCount === 1 ? firstRemove : secondRemove,
      } as unknown as ReturnType<typeof createChart>;
    });

    render(
      <PriceChart
        history={[{ date: '2026-07-17', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );
    expect(createChart).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '주' }));

    // The old chart is torn down and a brand-new instance created - a fresh
    // chart has no memory of any prior zoom/pan, so this structurally
    // guarantees the view resets to show all of the new period's bars.
    expect(firstRemove).toHaveBeenCalledOnce();
    expect(createChart).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/PriceChart.test.tsx
```

Expected: the 4 new tests FAIL — there's no tab UI yet, and everything still operates on raw daily `history`.

- [ ] **Step 3: Implement**

In `src/components/PriceChart.tsx`, add the import and period-unit label map:

```tsx
import { aggregateBars, type AggregationPeriod } from '../lib/aggregateBars';
```

```tsx
const PERIOD_LABELS: Record<AggregationPeriod, string> = { day: '일', week: '주', month: '월', year: '년' };
```

Add `period` state alongside the existing `legend`/`arrows` state:

```tsx
  const [period, setPeriod] = useState<AggregationPeriod>('day');
```

Add `period` to the effect's dependency array (this makes the effect's existing full teardown/recreate-on-change behavior also reset the zoom/pan whenever the period changes — the same thing that already happens today when `history`/`trades`/`avgCost` change):

```tsx
  }, [history, trades, avgCost, onPointSelect, period]);
```

At the top of the effect body, right after the `if (!container) return;` guard, compute the aggregated bars once:

```tsx
    const aggregated = aggregateBars(history, period);
```

Replace every `history` reference used for chart data (NOT the `history` prop itself, which stays as-is) with `aggregated`:

```tsx
    candleSeries.setData(
      aggregated.map((bar) => ({ time: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close }))
    );

    const closeValues = aggregated.map((bar) => bar.close);
    // ADR-0008: MA cap expanded from 1~2 (20/60일) to 5 (5/20/50/100/200일); 20일·200일 emphasized (lineWidth 3 vs 1).
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4 }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1 },
      { window: 20, color: '#f59e0b', lineWidth: 3 },
      { window: 50, color: '#8b5cf6', lineWidth: 1 },
      { window: 100, color: '#6366f1', lineWidth: 1 },
      { window: 200, color: '#0d9488', lineWidth: 3 },
    ];
    const legendEntries: { label: string; color: string; value: number }[] = [];
    for (const ma of MOVING_AVERAGES) {
      const series = chart.addSeries(LineSeries, { color: ma.color, lineWidth: ma.lineWidth, lastValueVisible: false });
      const maValues = simpleMovingAverage(closeValues, ma.window);
      series.setData(
        maValues
          .map((value, i) => ({ time: aggregated[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
      const latest = [...maValues].reverse().find((value): value is number => value != null);
      if (latest != null) {
        legendEntries.push({ label: `${ma.window}${PERIOD_LABELS[period]}`, color: ma.color, value: latest });
      }
    }
    setLegend(legendEntries);

    if (avgCost != null && aggregated.length > 0) {
      const avgCostSeries = chart.addSeries(LineSeries, {
        color: '#ea580c',
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
      });
      avgCostSeries.setData([
        { time: aggregated[0].date, value: avgCost },
        { time: aggregated[aggregated.length - 1].date, value: avgCost },
      ]);
    }
```

(this replaces the existing block that used `history` for the same purposes — the `MOVING_AVERAGES` items no longer carry a `label` field, since the label is now built from `ma.window` + the active period's unit character)

Update `computeArrows` to bucket each trade's exact date against the aggregated candle that contains it, instead of using the trade's raw date directly:

```tsx
    function bucketDateForTrade(tradeDate: string): string | undefined {
      let match: string | undefined;
      for (const bar of aggregated) {
        if (bar.date <= tradeDate) match = bar.date;
        else break;
      }
      return match;
    }

    function computeArrows() {
      const groups = new Map<string, { buy: number; sell: number }>();
      for (const t of trades) {
        if (!t.datetime) continue;
        const time = bucketDateForTrade(t.datetime.slice(0, 10));
        if (!time) continue;
        const g = groups.get(time) ?? { buy: 0, sell: 0 };
        g[t.side] += 1;
        groups.set(time, g);
      }
      const next: TradeArrow[] = [];
      for (const [time, g] of groups) {
        const x = timeScale.timeToCoordinate(time);
        if (x == null) continue;
        const bothSides = g.buy > 0 && g.sell > 0;
        if (g.buy > 0) {
          next.push({ time, side: 'buy', count: g.buy, x, offsetX: bothSides ? -BOTH_SIDES_OFFSET : 0 });
        }
        if (g.sell > 0) {
          next.push({ time, side: 'sell', count: g.sell, x, offsetX: bothSides ? BOTH_SIDES_OFFSET : 0 });
        }
      }
      setArrows(next);
    }
```

(`aggregated` is sorted oldest-first, same as `history` always was, so `bucketDateForTrade` finding the last bucket whose start date is `<=` the trade's date correctly finds the containing bucket for every period, including `'day'` where each bucket's date is exactly one trading day — this is a pure generalization, `'day'` behavior is unchanged since each bucket then covers exactly its own date)

Add the tab row to the returned JSX, as a sibling **before** the existing `position: relative` wrapper — not inside it. The `ma-legend` overlay is `position: absolute; top: 4; right: 4`, anchored to its nearest `position: relative` ancestor; if the tab row were placed inside that same wrapper, the legend would anchor to the wrapper's new (taller) top edge and overlap the tabs instead of the chart's own top-right corner. Keeping the tab row as an outer sibling leaves the existing wrapper — and everything anchored to it — untouched:

```tsx
  return (
    <div>
      <div role="radiogroup" aria-label="봉 단위" className="mb-1 flex gap-2">
        {(Object.keys(PERIOD_LABELS) as AggregationPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={
              period === p
                ? 'flex-1 rounded-xl bg-zinc-900 py-1.5 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'flex-1 rounded-xl border border-zinc-200 py-1.5 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
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
        <div data-testid="trade-arrow-lane" style={{ position: 'relative', height: 20 }}>
          {arrows.map((arrow) => (
            <button
              key={`${arrow.time}-${arrow.side}`}
              type="button"
              onClick={() => selectArrowGroup(arrow.time, arrow.side)}
              aria-label={`${arrow.side === 'buy' ? '매수' : '매도'} ${arrow.time}`}
              style={{
                position: 'absolute',
                left: arrow.x + arrow.offsetX,
                transform: 'translateX(-50%)',
                color: ARROW_COLOR[arrow.side],
                fontSize: '0.7rem',
                lineHeight: 1,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {arrow.side === 'buy' ? '▲' : '▼'}
              {arrow.count > 1 ? ` ×${arrow.count}` : ''}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/PriceChart.test.tsx
npm run build
```

Expected: PASS, build clean. Then run the full suite once, since `ChartScreen.test.tsx`/`App.test.tsx` render `PriceChart` too:

```bash
npx vitest run
```

Expected: all tests PASS — `period` defaults to `'day'`, `aggregateBars(history, 'day')` returns `history` unchanged, so every existing test (which never clicks a tab) sees byte-for-byte the same behavior as before this task.

- [ ] **Step 5: Commit**

```bash
git add src/components/PriceChart.tsx src/components/PriceChart.test.tsx
git commit -m "feat: 차트에 일/주/월/년 탭 추가, 이동평균/매매화살표/평단선을 활성 봉 기준으로 집계"
```

---

## Final check (whole branch)

After Task 4, run the complete verification once more from the repo root:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run
npm run build
```

Expected: all tests pass, build clean. Then proceed to `superpowers:finishing-a-development-branch`.

**Manual follow-up (cannot be automated in this plan):** verify against the real data.go.kr API key that the 20-year pagination in `dataGoKrHistory` actually returns full, correctly-ordered history for a real long-held KR ticker — the practical depth of data.go.kr's history and its true per-request row cap aren't confirmed from documentation alone.
