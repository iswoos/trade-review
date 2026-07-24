# Market Data Provider Swap — Design Spec

## Background

Production (`trade-review-eight.vercel.app`) currently has two broken market-data
dependencies, discovered while investigating two user-reported bugs:

1. **검색**(`api/search.ts`): merges FMP `search-name` and `yahoo-finance2`
   `.search()`. Both fail today — FMP with `429 Limit Reach` (plan quota
   exhausted), Yahoo with a JSON-parse error (Yahoo now returns a non-JSON
   anti-bot response to `yahoo-finance2`'s crumb-based requests, a known
   widespread issue with that library, especially from cloud/serverless IPs).
   Because both sources fail, `apiResults` in `TickerSearch` is always empty
   — the search dropdown only ever shows client-side matches against
   existing `positions`, making it look like new-ticker search is broken.
2. **시세/과거시세**(`api/quote.ts`, `api/history.ts`): Korean symbols
   (`.KS`/`.KQ`) route to `yahoo-finance2` (broken per above); non-Korean
   symbols route to FMP (broken per above, quota exhausted).

This spec replaces both providers.

## Goals

- Restore working ticker search (KR + US) and quote/history lookups.
- Move off Yahoo Finance entirely (unofficial, actively blocking this
  library) and off FMP (plan-limited).
- Keep the existing `isKoreanSymbol()` market split — swap what's behind
  each branch, not the branch structure itself.

## Out of scope

- Real-time/intraday quotes. This app is a trade-review journal, not a
  live-trading tool; end-of-day data is sufficient (confirmed with user).
- Any UI change beyond the debounce/caching described below.
- Re-adding a fallback/secondary provider for US data (Twelve Data fully
  replaces FMP; no dual-source merge for US).

## Provider choice

| Market | Provider | Why |
|---|---|---|
| KR quote/history | 공공데이터포털 (data.go.kr) 금융위원회_주식시세정보 | Free, official KRX-sourced data, no brokerage account. EOD only, T+1 (Friday's close lands Monday afternoon) — acceptable for a review app (confirmed with user). |
| KR search | Bundled static file (`src/data/krx-listing.json`) built from 금융위원회_KRX상장종목정보 | That API returns the full listed-company roster once a day, not a free-text search endpoint — there is nothing to call per-keystroke. Bundling avoids an API call per search entirely. Refreshed by re-running a script when listings change (rare: new listings/delistings). |
| US quote/history/search | Twelve Data | Official REST API, generous-enough free tier (800 calls/day, 8/min) vs. FMP's exhausted plan. One provider covers all three US endpoints, replacing FMP outright — confirmed with user. |

**Removed entirely**: `api/_lib/fmp.ts` + `fmp.test.ts`, the `yahoo-finance2`
dependency, and `FMP_API_KEY`. Neither has a remaining caller after this
change.

## Architecture

```
api/search.ts   → KR: filter src/data/krx-listing.json in-memory (no network call)
                → US: Twelve Data /symbol_search
                → merge both result arrays (same shape as today's merge, just different sources)

api/quote.ts    → KR: 공공데이터포털 getStockPriceInfo (latest available basDt)
                → US: Twelve Data /quote

api/history.ts  → KR: 공공데이터포털 getStockPriceInfo (beginBasDt/endBasDt range, 1 year back — same window fmpHistory used)
                → US: Twelve Data /time_series (interval=1day, outputsize covering ~1 year)
```

### New files

- **`api/_lib/dataGoKr.ts`** — replaces `fmp.ts`'s KR-facing role (today KR
  quote/history actually went through `yahoo-finance2`, not FMP; this file
  is new, not a rename).
  - `dataGoKrQuote(symbol: string): Promise<{ symbol: string; price: number }>`
    — calls `getStockPriceInfo` with `likeSrtnCd=<symbol>` and no date
    (or the most recent trading day — see Implementation Note below),
    `numOfRows=1`, takes the latest row's `clpr` as price.
  - `dataGoKrHistory(symbol: string): Promise<{ date: string; price: number }[]>`
    — calls `getStockPriceInfo` with `likeSrtnCd=<symbol>`,
    `beginBasDt`/`endBasDt` spanning 1 year, `numOfRows=500`+, maps
    `basDt` → `date` (formatted `YYYY-MM-DD`), `clpr` → `price`, sorted
    oldest-first (matching `fmpHistory`'s existing contract).
  - Base URL: `http://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo`
  - Auth: `serviceKey` query param, from `process.env.DATA_GO_KR_API_KEY`.
  - **Implementation Note (verify against live docs during Task
    implementation):** the exact request parameter names above
    (`likeSrtnCd`, `basDt`, `beginBasDt`, `endBasDt`, `numOfRows`,
    `pageNo`, `resultType`) and response fields (`basDt`, `srtnCd`,
    `itmsNm`, `clpr`, `mkp`, `hipr`, `lopr`, `trqu`) are taken from public
    documentation and community reference implementations, not a live
    test call — this account has no `DATA_GO_KR_API_KEY` yet. The
    implementer must request `resultType=json` and confirm the actual
    response shape against a real call once the user has obtained and
    supplied a service key, adjusting field mapping if it differs.
    `srtnCd` (종목코드, e.g. `005930`) is the identifier — the app's
    existing KR symbols carry a `.KS`/`.KQ` suffix (Yahoo convention);
    strip it before querying (`symbol.replace(/\.(ks|kq)$/i, '')`).

- **`api/_lib/twelveData.ts`** — replaces `fmp.ts`'s US-facing role.
  - `twelveDataQuote(symbol): Promise<{ symbol: string; price: number }>`
    — `GET https://api.twelvedata.com/quote?symbol=<symbol>&apikey=<key>`,
    reads `close` (string) → `Number(close)`.
  - `twelveDataHistory(symbol): Promise<{ date: string; price: number }[]>`
    — `GET https://api.twelvedata.com/time_series?symbol=<symbol>&interval=1day&outputsize=365&apikey=<key>`,
    maps `values[].datetime` (already `YYYY-MM-DD` for `1day` interval) →
    `date`, `values[].close` → `price`; Twelve Data returns newest-first,
    so reverse to oldest-first (same convention as `dataGoKrHistory` and
    the old `fmpHistory`).
  - `twelveDataSearch(query): Promise<{symbol,name,exchange}[]>` —
    `GET https://api.twelvedata.com/symbol_search?symbol=<query>&apikey=<key>`,
    maps `data[].symbol` → `symbol`, `data[].instrument_name` → `name`,
    `data[].exchange` → `exchange`.
  - Auth: `apikey` query param, from `process.env.TWELVE_DATA_API_KEY`.
  - Twelve Data returns `{"status":"error", ...}` with an HTTP error status
    on failure (bad key, rate limit) — treat any non-`ok`/non-200 the same
    way `fmpFetch` did: throw, letting the caller's `try/catch` produce the
    existing 502.

- **`scripts/fetch-krx-listing.ts`** — one-off/occasionally-rerun Node
  script (not part of the build or CI). Calls 금융위원회_KRX상장종목정보
  (`GetKrxListedInfoService/getItemInfo`) with the user's
  `DATA_GO_KR_API_KEY`, paginates through all rows, writes
  `src/data/krx-listing.json` as `{ symbol: string; name: string }[]`
  (`symbol` = `srtnCd` + `.KS`/`.KQ` suffix reconstructed from `mrktCtg`
  to match the app's existing symbol convention — KOSPI → `.KS`, KOSDAQ →
  `.KQ`). Run manually by the user whenever the roster needs refreshing;
  not scheduled/automated (YAGNI — listings change rarely, no cron
  infrastructure exists in this project).

- **`src/data/krx-listing.json`** — committed to the repo. Placeholder
  content until the user runs the script with a real key (see Rollout
  below); tests use a small fixture array, not this file directly.

### Modified files

- **`api/search.ts`** — KR branch reads `krx-listing.json` and filters by
  substring match on `symbol`/`name` (same case-insensitive `includes()`
  logic `TickerSearch` already uses client-side for positions); US branch
  calls `twelveDataSearch`. Both run in parallel (`Promise.allSettled`,
  same structure as today), merged and deduped by `symbol` the same way.
- **`api/quote.ts`** / **`api/history.ts`** — swap the `yahooFinance`/`fmpQuote`/`fmpHistory`
  calls for `dataGoKrQuote`/`dataGoKrHistory` (KR branch) and
  `twelveDataQuote`/`twelveDataHistory` (US branch, replacing FMP).
- **`src/components/TickerSearch.tsx`** — wrap `handleChange`'s API call in
  a 300ms debounce (a `setTimeout`/`clearTimeout` pair keyed on the input
  value; the existing `latestQueryRef` staleness guard stays as-is and
  still protects against out-of-order responses once the debounced call
  resolves).
- **`src/api/quotes.ts`** — `fetchQuote`/`fetchHistory` gain a 5-minute
  in-memory cache keyed by `symbol` (module-level `Map`, timestamp-checked
  on read, no eviction beyond overwrite — this is a client-side session
  cache, not a persistence layer). `searchSymbols` is not cached (search
  results should always reflect current input).

### Deleted files

- `api/_lib/fmp.ts`, `api/_lib/fmp.test.ts`

### package.json

- Remove `yahoo-finance2` dependency.
- No new npm dependency needed for either replacement (both use plain
  `fetch`, matching the existing `fmp.ts` style).

## Error handling

Unchanged from today: each handler's `try/catch` returns `502` with a
generic message on any failure; the frontend (`src/api/quotes.ts`) already
swallows fetch failures into `[]`/`null`. No new user-facing error UX in
this round (matches existing behavior; a dedicated "일시적으로 조회 불가"
message was explicitly deferred as out of scope).

## Testing

Follow the existing `fmp.test.ts` pattern exactly: `vi.stubGlobal('fetch', ...)`
per test, asserting the outgoing request URL/params and the mapped
response shape. `search.test.ts` keeps its current shape (mock both
sources, assert merge/fallback/502 behavior) but mocks
`dataGoKr`'s listing-file read (or a small in-test fixture array) instead
of `yahoo-finance2`, and `twelveData.search` instead of `fmp.search`.
`TickerSearch.test.tsx` gains a debounce test (fake timers: typing doesn't
call `searchSymbols` until the timer fires) and confirms the existing
staleness-guard tests still pass unchanged. `quotes.test.ts` gains cache-hit/cache-miss/cache-expiry
tests for `fetchQuote`/`fetchHistory`.

## Rollout (user-owned steps, not part of implementation)

Before this can be verified against real data or deployed:

1. User signs up at data.go.kr for 금융위원회_주식시세정보 and
   금융위원회_KRX상장종목정보, obtains a `serviceKey`.
2. User signs up at twelvedata.com, obtains an API key.
3. User runs `scripts/fetch-krx-listing.ts` locally with the data.go.kr key
   to populate `src/data/krx-listing.json` for real.
4. User adds `DATA_GO_KR_API_KEY` and `TWELVE_DATA_API_KEY` to Vercel
   project env vars (Production + Preview), removes `FMP_API_KEY`.

The implementation plan produces working, tested code against these
contracts; it cannot fully verify the 공공데이터포털 response shape
end-to-end without a real key (see Implementation Note above) — the
implementer should build against the documented/community-verified shape
and flag any discrepancy found once real-key testing becomes possible.
