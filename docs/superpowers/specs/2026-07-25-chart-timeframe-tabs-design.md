# Chart Timeframe Tabs (일/주/월/년) — Design Spec

## Background

`PriceChart.tsx` always renders daily candles. Korean stock apps (e.g. 네이버 증권, 키움증권) let the user switch between 일봉/주봉/월봉/년봉 — real re-aggregated candles per period, not just a zoomed view of the same daily bars (the US-style "1D/1W/1M/1Y" convention). The user wants this Korean-style behavior.

## Goals

- Add 일/주/월/년 tabs directly above the chart. Default: 일봉 (today's behavior, unchanged).
- Switching tabs re-aggregates the already-fetched daily history into weekly/monthly/yearly OHLC candles, entirely client-side — no new network request per tab switch.
- Moving averages (5/20/50/100/200) recalculate on the active period's bars (e.g. 주봉 view shows 5/20/50/100/200-**week** averages).
- Trade arrows re-map to whichever aggregated candle contains that trade's date, keeping the existing same-bucket ×N grouping behavior (`src/components/PriceChart.tsx`'s existing `computeArrows`).
- Switching tabs resets the visible zoom range to "show all" — the previous zoom's logical-range indices are meaningless once the bar count changes.
- Backend history fetch range expands from ~1 year to each provider's practical single-call maximum, so 월봉/년봉 have enough data to be useful.

## Out of scope

- On-demand loading of *even older* history when the user scrolls back past what's already fetched (e.g. a stock with 20+ years of trading history exceeding Twelve Data's ~20-year single-call maximum). If this is ever needed, it's a separate feature (pagination + lazy-load while panning) — deferred.
- Intraday/minute-level candles — out of scope entirely, this app only ever dealt in daily-or-coarser bars.
- Changing how `fetchHistory`'s 5-minute client-side cache TTL works (`src/api/quotes.ts`) — unaffected by a larger payload.

## Aggregation semantics

New pure function, `aggregateBars(bars: HistoryBar[], period: 'day' | 'week' | 'month' | 'year'): HistoryBar[]` in a new file `src/lib/aggregateBars.ts`. `bars` is assumed sorted oldest-first (already true of every `HistoryBar[]` this app produces).

- `period: 'day'` returns `bars` unchanged (identity) — this is what today's chart already shows.
- `period: 'week'`: groups by Monday-start week (Korean convention) — bars sharing the same ISO week (Monday..Sunday) go in one bucket.
- `period: 'month'`: groups by calendar month (`YYYY-MM`).
- `period: 'year'`: groups by calendar year (`YYYY`).
- Each bucket becomes one `HistoryBar`: `open` = first bar in the bucket's `open`, `close` = last bar's `close`, `high`/`low` = max/min across the bucket, `date` = the **first** trading day in the bucket (so a partial/in-progress week/month/year is keyed by its actual start, not some future calendar boundary that hasn't happened yet).
- Buckets are emitted in the same order as the input (oldest first), one row per bucket, no gaps inserted for buckets with zero trading days (weekends/holidays simply never contribute a bar, same as today).

## UI

- A row of 4 buttons (일/주/월/년) directly above the chart container in `PriceChart.tsx`, styled consistently with the existing quantity-mode toggle in `AddTradeSheet.tsx` (active button filled, inactive outlined).
- Clicking a tab sets an internal `period` state (default `'day'`), which drives which aggregated array feeds the candle series, the moving averages, and the arrow-bucketing.
- On period change, the chart's visible range resets to fit all available bars for that period (equivalent to calling `timeScale().fitContent()`), rather than trying to preserve any prior zoom/pan state.

## Moving averages, arrows, avg-cost line

- Moving averages: computed via the existing `simpleMovingAverage` against the **aggregated** closes, not the raw daily closes. The 5/20/50/100/200 window sizes stay the same numbers, just applied to whichever period's bars are active (so 주봉 view genuinely means 5/20/50/100/200-week averages, not day-based windows re-labeled).
- Trade arrows: each trade's date is mapped to the aggregated bucket that contains it (same day → its own bucket in daily view; in weekly/monthly/yearly view, the bucket whose date range contains the trade's date), then grouped exactly as today (same-bucket, same-side trades collapse into one arrow with a `×N` suffix).
- Avg-cost dashed line: unaffected — it already only depends on the first/last bar's date of whatever `history` array is passed to the chart, which naturally becomes the first/last *aggregated* bucket.

## Backend history range expansion

Both providers currently fetch roughly 1 year of daily bars. This isn't enough for 월봉/년봉 to show a meaningful number of candles, so both expand to "as much as a single call comfortably allows":

- **Twelve Data** (`api/_lib/twelveData.ts`, `twelveDataHistory`): `outputsize` goes from `'365'` to `'5000'` (Twelve Data's documented max for `time_series`, ≈20 years of daily bars in one call — no pagination needed).
- **data.go.kr** (`api/_lib/dataGoKr.ts`, `dataGoKrHistory`): this one needs real changes, not just a wider date window. Today it fetches a single page (`numOfRows: '500', pageNo: '1'`) — fine for ~250 trading days/year, but a 20-year window is roughly 5,000 trading days, far past one page. `dataGoKrHistory` gains pagination: fetch page 1, read `totalCount` from the response body, and keep fetching subsequent pages (reusing the same "loop until all rows collected" shape already proven in `scripts/fetch-krx-listing.mjs`) until all rows for the date range are collected. The lookback window (`from.setFullYear(...)`) widens from 1 year to 20 years. The existing `dataGoKrQuote` function is untouched — it uses a separate, smaller single-page call (`numOfRows: '10'`) and doesn't need this.

Since data.go.kr's actual practical depth of available history (or its true per-request row cap) isn't confirmed from documentation alone, this is verified empirically during implementation with the real API key, not assumed.

## Testing

- `src/lib/aggregateBars.test.ts` (new): identity for `'day'`; a multi-week fixture aggregates into the correct weekly buckets (Monday-start, correct open/high/low/close, correct bucket date); a multi-month fixture for `'month'`; a multi-year fixture for `'year'`; a bucket spanning a weekend/holiday gap doesn't create an empty extra bucket.
- `PriceChart.test.tsx`: clicking each tab renders that period's aggregated candle data (assert on the mocked `setData` call); moving averages recompute against the aggregated closes for a non-day period; clicking a tab calls `fitContent()` (or equivalent full-range reset) on the time scale; a trade whose date falls inside a multi-day weekly/monthly bucket still produces exactly one arrow positioned at that bucket.
- `api/_lib/twelveData.test.ts`: `twelveDataHistory` requests `outputsize=5000`.
- `api/_lib/dataGoKr.test.ts`: `dataGoKrHistory` fetches a second page when `totalCount` exceeds the first page's `numOfRows`, and stops once all rows are collected; the lookback window is 20 years.
