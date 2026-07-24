# Chart Screen Redesign — Design Spec

## Background

The chart screen (`ChartScreen.tsx` + `PriceChart.tsx`) has accumulated several UX gaps discovered through direct use:

1. The chart ignores the app's dark/light theme entirely — it always renders with `lightweight-charts`' light-mode defaults.
2. `lightweight-charts` shows its default attribution logo in the corner; the app has never configured this.
3. Pinch/touch zoom on the chart always scales time and price together — there's no way to zoom just one axis.
4. Trade markers are thin arrows (`arrowUp`/`arrowDown`) that are hard to see against the price line.
5. Five moving-average lines are color-coded with no legend — a user can't tell which color is which period, or its current value.
6. The trade list ("매매 목록") only opens via a separate button into a bottom sheet; an individual trade's detail ("매매내역"), reached by tapping a chart marker or list row, currently renders inline in the page (a bug — it's missing the modal overlay wrapper the other two sheets have).
7. The price series is a plain line; showing real OHLC candlesticks would better communicate daily price action.

## Goals

- Chart follows the app's dark/light theme live.
- Comply with `lightweight-charts`' attribution requirement while removing the default on-chart logo.
- Independent pinch/swipe zoom: horizontal swipe over the time axis zooms time only; vertical swipe over the price axis zooms price only; the plot area keeps existing pan/pinch behavior.
- Price shown as OHLC candlesticks (red up / blue down — the KR market convention), not a plain line.
- Moving averages get a legend (period + latest value, color-matched) in the top-right corner.
- Trade markers are large, high-contrast circles that don't visually collide with the new candle colors.
- The trade list renders inline below the chart (no separate button/sheet); each row's memo is clamped to 3 lines with an expand/collapse toggle.
- Tapping a marker or list row opens the trade detail as a proper modal (fixing the existing unwrapped-overlay bug).

## Out of scope

- Multi-day chart windows beyond the existing ~1 year default.
- Trade-entry-form changes (매수/매도 button colors, save button, tag-based conviction replacement, etc.) — tracked as a separate design (`docs/superpowers/specs/<date>-trade-entry-form-redesign-design.md`), since it's a different screen/subsystem.
- Real-time/intraday data (unchanged from the existing EOD-only architecture).

## Dependency upgrade: lightweight-charts v4.2.3 → v5.2.0

Confirmed via the installed package's own type definitions and the official v4→v5 migration guide — two breaking changes affect this codebase:

- `chart.addLineSeries(options)` → `chart.addSeries(LineSeries, options)`, importing `LineSeries`/`CandlestickSeries` from `lightweight-charts`.
- `series.setMarkers(markers)` → `createSeriesMarkers(series, markers)`, which returns a plugin object; call `.setMarkers(...)` on that returned object to update markers later.

No other breaking changes were found for the APIs this codebase uses (`subscribeClick`, `LineStyle`, `timeScale().setVisibleRange`, `handleScale`/`handleScroll` options) per the migration guide.

v5 adds three `IPriceScaleApi` methods this design needs and v4 doesn't have: `setVisibleRange(range)`, `getVisibleRange()`, `setAutoScale(on)` — confirmed present in the v5.2.0 type definitions. `layout.attributionLogo: boolean` (default `true`) is present in both v4.2.3 and v5.2.0.

## OHLC data (backend extension)

Both upstream APIs already return open/high/low alongside close — the app's mapping just discards them today:

- `api/_lib/dataGoKr.ts`: data.go.kr's `getStockPriceInfo` rows include `mkp` (open), `hipr` (high), `lopr` (low), `clpr` (close) — confirmed via a live call. `dataGoKrHistory` maps only `clpr` today; it will map all four.
- `api/_lib/twelveData.ts`: Twelve Data's `time_series` values include `open`, `high`, `low`, `close` — confirmed via the API docs fetched earlier. `twelveDataHistory` maps only `close` today; it will map all four.
- `api/history.ts`: response shape becomes `{ bars: { date, open, high, low, close }[] }` (was `{ date, close }[]`).
- `src/api/quotes.ts`: `HistoryBar` gains `open`, `high`, `low` fields alongside the existing `close`. The 5-minute cache logic is unaffected structurally (same key, same TTL, just a richer cached value).
- All four files' existing tests get their fixtures extended with open/high/low values; no test's *assertions* about caching, error handling, or date ordering change — only the data shape widens.

## Color palette

The candle colors force a full palette pass (KR convention: red = up, blue = down), since two existing colors would otherwise collide with candle bodies:

| Element | Color | Note |
|---|---|---|
| Candle up | `#dc2626` | red |
| Candle down | `#2563eb` | blue |
| MA 5-day | `#94a3b8` | unchanged (gray) |
| MA 20-day | `#f59e0b` | unchanged (amber), lineWidth 3 |
| MA 50-day | `#8b5cf6` | **changed** from `#10b981` (was identical to the accent color now used for the buy marker) |
| MA 100-day | `#6366f1` | unchanged (indigo) |
| MA 200-day | `#0d9488` | **changed** from `#dc2626` (was identical to candle-up red), lineWidth 3, teal |
| Avg-cost line | `#ea580c` | unchanged (orange, dashed — distinguished from MA20 by line style) |
| Buy marker | `#10b981` | large circle (`size: 2`), reuses the app's accent green — distinct from both candle colors and every MA color |
| Sell marker | `#a855f7` | large circle (`size: 2`), purple — distinct from every other color on the chart |

## Dark mode

No shared theme state/context exists today — `ThemeToggle` holds `ThemePreference` as local `useState`, resolves it against `matchMedia`, and its only observable side effect is toggling the `dark` class on `document.documentElement` (`applyTheme` in `src/lib/theme.ts`). `PriceChart` will not duplicate the preference-resolution logic; instead it observes the actual source of truth directly: a `MutationObserver` watching `document.documentElement`'s `class` attribute, reading `classList.contains('dark')` on mount and on every mutation, then calling `chart.applyOptions({ layout: {...}, grid: {...} })` (cheap — no chart rebuild) whenever the resolved value changes.

| | Light | Dark |
|---|---|---|
| Background | `#ffffff` | `#18181b` (zinc-900) |
| Grid lines | light gray (library default) | `#27272a` (zinc-800) |
| Text/axis labels | dark gray (library default) | `#a1a1aa` (zinc-400) |

## Watermark / attribution

`layout.attributionLogo: false` removes the on-chart logo. Per the license comment in the library's own type definitions, this requires the app to otherwise link to `https://www.tradingview.com/` somewhere a user can see it. A small "Powered by TradingView Lightweight Charts" text link is added to `HomeScreen.tsx`'s footer — unobtrusive, satisfies the requirement once per app rather than once per chart view.

## Independent time/price zoom

- **Time axis** (existing v4 API, unchanged in v5): touches starting in the bottom time-label region call `timeScale().setVisibleLogicalRange()` to widen/narrow the visible range based on horizontal drag delta.
- **Price axis** (new in v5): touches starting in the right price-label region (its width obtained via `chart.priceScale('right').width()`) call `priceScale.setAutoScale(false)` once, then `setVisibleRange()` on drag to widen/narrow the visible price range based on vertical drag delta.
- **Plot area**: touches starting outside both label regions keep the existing pan/pinch behavior untouched.
- Exact hit-region pixel boundaries (particularly the time-axis label region's height, which isn't exposed as directly as `priceScale().width()`) will need tuning against the real rendered chart during implementation — normal for custom gesture work, not a sign of an incomplete plan.

## Moving-average legend

A plain HTML `<div>` absolutely positioned in the top-right of the chart's container (sibling to the canvas, not a chart-native feature — `lightweight-charts` doesn't provide this), listing each of the 5 MAs as `{period}일 {latestValue}`, text color matching that MA's line color. Value is static (the latest computed point), not crosshair-following — it does not update as the user's finger/cursor moves over historical points. Rebuilt whenever `history` changes (same effect that recomputes the MAs today). Values are rendered as raw numbers (no thousands separators) — this matches the existing convention elsewhere in the app (`TradeList.tsx`, `TradeBottomSheet.tsx` both interpolate `trade.price` unformatted); introducing number formatting is out of scope for this change.

## Trade markers

Markers move to v5's `createSeriesMarkers(series, markers)`. Buy: `shape: 'circle'`, `color: '#10b981'`, `size: 2`. Sell: `shape: 'circle'`, `color: '#a855f7'`, `size: 2`. Position (`aboveBar`/`belowBar`) unchanged from today.

## Trade list inline + trade detail modal

- `ChartScreen.tsx`: remove the "매매 목록" button and its `showListSheet`/bottom-sheet wrapper entirely. `TradeList` renders unconditionally below the chart card, in the same scrolling column as everything else on the screen.
- `TradeList.tsx`: each row gains a memo preview (if `trade.memo` is non-empty) rendered with `line-clamp-3` by default; a "더보기" text button expands it to the full, unclamped text with a "접기" button to re-collapse. Expand/collapse state is per-row, local to `TradeList` (not persisted).
- `TradeBottomSheet.tsx` (매매내역 detail): `ChartScreen.tsx` wraps it in the same `fixed inset-0 z-20 flex items-end bg-zinc-900/40` overlay pattern the Add/List sheets already use, with a `role="dialog"` and explicit 닫기 button — this both fixes the existing unwrapped-inline bug and satisfies the "show as a popup" request in one change.

## Testing

- `PriceChart.test.tsx`: update for the v5 API surface (mocking `addSeries`/`createSeriesMarkers` instead of `addLineSeries`/`setMarkers`), candlestick data mapping, dark-mode `MutationObserver` reaction, legend content/values, marker shape/color assertions. Zoom touch-handling gets focused tests for region detection (which handler fires for a touch-start coordinate in each region) using synthetic touch events; the exact drag-to-range-delta math gets a couple of numeric assertions but isn't exhaustively fuzzed.
- `ChartScreen.test.tsx`: update for the removed list-button/sheet and the always-visible inline list; add a test that the detail modal opens with the overlay wrapper present (`role="dialog"`, closeable).
- `TradeList.test.tsx`: memo clamp/expand-collapse behavior (row without memo shows nothing extra; row with a long memo shows clamped text + "더보기"; clicking it expands and swaps to "접기").
- `api/_lib/dataGoKr.test.ts`, `api/_lib/twelveData.test.ts`, `api/history.test.ts`, `src/api/quotes.test.ts`: extend existing fixtures with open/high/low; existing assertions about ordering/caching/error-handling are otherwise unchanged.
