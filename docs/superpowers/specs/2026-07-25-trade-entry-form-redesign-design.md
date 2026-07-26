# Trade Entry Form Redesign — Design Spec

## Background

Direct use of the trade-entry form (`AddTradeSheet.tsx`) and search (`TickerSearch.tsx`) surfaced several gaps:

1. Search debounces every query by 500ms, even Korean-language queries that only ever hit the free, unlimited local KR listing (no external API call, no rate limit to protect).
2. 매수/매도 buttons use the app's generic accent/loss colors, unrelated to the chart's new red-up/blue-down candle convention (tracked separately in `docs/superpowers/specs/2026-07-25-chart-screen-redesign-design.md`) — worth aligning so the same trade is represented consistently across screens.
3. The form has **zero validation** — every field is effectively optional, including price and quantity, which silently save as `0` if left blank.
4. The "시간 모름 / 예약매매" toggle adds a mode where nothing about the trade's timing needs to be known, which conflicts with introducing real required-field validation.
5. The save button's label ("저장 · 평단 자동계산") describes a calculation that happens automatically downstream, not something the user does — confusing wording for what is just a save action.
6. Trade conviction is captured as a 1-5 star rating (`ConvictionStars`) with no stated meaning — a tag-based "why did I make this trade" already exists in the data model (`Tag`, `TagPicker`) and is a clearer, more useful signal, but currently has no tag-management UI (create/rename/archive exist in `src/db/tags.ts` with zero callers outside its own test).
7. Quantity-entry mode is labeled "주"/"원" regardless of the trade's actual currency — for a USD trade, the "원" (KRW) label is actively wrong, and no currency unit is shown anywhere near the price/quantity fields.

## Goals

- Korean-language search queries return instantly (no debounce) since they only ever hit the free local KR listing; non-Korean queries keep the existing 500ms debounce (Twelve Data, rate-limited).
- 매수 = red (`#dc2626`), 매도 = blue (Tailwind `blue-600`, `#2563eb`) — matches the chart redesign's candle convention.
- Save button reads "저장" only, colored green (the app's existing accent color).
- Remove "시간 모름 / 예약매매" entirely. Require: 체결 날짜, 매수/매도, 수량, 가격, and at least one rationale tag. 체결 시각 (time) alone stays optional. Save is disabled until all required fields are filled.
- Remove `ConvictionStars` entirely. Rationale tags become the sole "why" signal, with a visible "매수/매도 이유" label above the tag picker (today it only has an `aria-label`, no visible heading).
- Seed 8 default rationale tags on first use (see below), and add a full tag-management screen (create, rename, archive) — the DB layer already supports all three operations, only the UI is missing.
- Quantity-mode toggle labels become currency-aware: "수량(주)" / "금액(원)" for KRW trades, "수량(주)" / "금액($)" for USD trades. Price/quantity field labels show the matching currency unit.

## Out of scope

- Chart-screen changes — separate spec/plan.
- Image attachments in memos — deferred in an earlier session, unaffected by this work.
- Renaming/restructuring the underlying `Trade`/`Tag` DB schema — `Tag` already has exactly what's needed (`{id, name, archived}`).

(FX-rate auto-fetch was also deferred earlier, but is now explicitly back in scope — see below.)

## Search debounce (KR instant, US 500ms)

`TickerSearch.tsx`'s `handleChange` gains the same Hangul-detection regex already added to `api/search.ts` (`/[ㄱ-ㆎ가-힣]/`). If the query contains Hangul, call `runSearch(next)` immediately (no `setTimeout`); otherwise keep the existing 500ms debounce path (`debounceTimerRef`/`setTimeout`) unchanged.

## AddTradeSheet changes

**Buy/sell buttons**: `side === 'buy'` → `bg-loss` (the app's existing red token, `#dc2626` — reused, not a new color); `side === 'sell'` → `bg-blue-600` (Tailwind's built-in blue, `#2563eb`). Both keep `text-white font-bold`, matching the existing selected-button style otherwise.

**Save button**: label text becomes `저장` (drop `· 평단 자동계산`). Color unchanged (`bg-accent`, green) — already green today, so no change needed there, only the label shortens.

**Remove "시간 모름 / 예약매매"**: delete `toggleDatetimeUnknown`, the `datetimeUnknown` state, and the toggle button. The date input (`datetimeValue`) and time input (`timeValue`) are always enabled; date defaults to today as it does now when the toggle is off.

**Validation (blocks save)**: the submit button's `disabled` attribute becomes:
```
!datetimeValue ||
!price.trim() ||
!quantityValue.trim() ||
tagIds.length === 0 ||
(quantityType === 'amount' && currency !== 'KRW' && !fxRateAtTrade)
```
(`side` always has a valid default of `'buy'`/`'sell'` from a two-button toggle, so it can't be "empty" — no separate check needed.) `timeValue` is never part of this check — it stays optional. The last clause only applies in the one mode where an FX rate is needed at all (see FX rate auto-fetch below) — `fxRateAtTrade` is populated automatically, not by the user, but save still waits for it to be present. `handleSave` itself is otherwise unchanged (still builds `datetime` from `datetimeValue` + optional `timeValue`).

**Remove `ConvictionStars`**: delete the import, the `conviction` state, and the `<ConvictionStars .../>` element. `createTrade`'s `conviction` argument is passed `null` unconditionally (the field stays in the `Trade` type/schema for backward compatibility with existing saved trades — not part of this change).

**Rationale-tag heading**: add a visible label above `<TagPicker .../>`:
```tsx
<p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">매수/매도 이유</p>
<TagPicker tags={availableTags} selectedIds={tagIds} onChange={setTagIds} />
```

**Currency-aware quantity/price labels**: the quantity-type toggle's two buttons change caption from `주`/`원` to `수량(주)` / a currency-aware label:
```tsx
{currency === 'KRW' ? '금액(원)' : '금액($)'}
```
The quantity input's own `<label>` text (currently `수량` / `금액(원)` unconditionally) becomes `수량(주)` / the same currency-aware `금액(원)`/`금액($)` string. The price input's label gains the same currency-aware suffix: `체결가 (원)` for KRW, `체결가 ($)` for USD.

## FX rate auto-fetch (replaces manual entry)

Today, when `quantityType === 'amount' && currency !== 'KRW'`, the form shows a manual "체결 시점 환율" number input the user must fill in themselves. This is removed entirely and replaced with an automatic fetch of the historical USD/KRW rate for the trade's execution date.

Twelve Data (already integrated, same API key already in use for US stock quotes) supports forex pairs through the same `time_series` endpoint already used for stock history — confirmed via a live call: `GET https://api.twelvedata.com/time_series?symbol=USD/KRW&interval=1day&start_date=<date>&end_date=<date>` returns `{ values: [{ datetime, open, high, low, close }], ... }` for that date. No new provider, no new API key, no new signup — this is an addition to the existing `api/_lib/twelveData.ts` client.

- **New client function**: `twelveDataFxRate(date: string): Promise<number>` in `api/_lib/twelveData.ts`, requesting `USD/KRW` `time_series` for that date and parsing `values[0].close`. If the exact date has no data (forex has thin weekend/holiday gaps, unlike the once-a-year KRX-listing case but the same shape of problem), walk backward up to a few days similarly to how `dataGoKrQuote`/`fetch-krx-listing.mjs` already handle "nearest prior trading day" — reuse that pattern rather than inventing a new one.
- **New endpoint**: `api/fxrate.ts`, `GET /api/fxrate?date=YYYY-MM-DD`, calling `twelveDataFxRate` and returning `{ rate: number }`, with the same `try/catch` → `502` pattern every other endpoint in this codebase uses.
- **New client-side function**: `fetchFxRate(date: string): Promise<number | null>` in `src/api/quotes.ts`, following the existing `fetchQuote`/`fetchHistory` fetch-and-swallow-to-null-on-failure convention (no cache — this is a low-frequency, one-shot fetch per trade entry, not a hot path worth protecting with a TTL cache the way search/quote/history are).
- **`AddTradeSheet.tsx`**: the manual `fxRateAtTrade` input and its label are deleted. When `quantityType === 'amount' && currency !== 'KRW'` and `datetimeValue` is set, an effect calls `fetchFxRate(datetimeValue)` and stores the result in `fxRateAtTrade` state (kept, just no longer user-editable — `handleSave` reads it exactly as it does today). If the fetch fails (`null`), the form shows an inline "환율 조회 실패 — 다시 시도" message with a retry button instead of falling back to a manual field, and save stays disabled per the required-fields rule (`fxRateAtTrade` empty counts as missing, same as any other required field, only surfaced in this one currency/quantity-mode combination).

## Default rationale tags + seeding

Order reflects expected usage frequency for a long-term personal investor (most-used first), per discussion: **잘 모르겠음** (replaces an earlier "장기투자" candidate — a trade without a clear stated reason must still be a valid, savable choice given rationale is now required), 익절, 손절, 실적발표, 뉴스/이슈, 기술적분석, 거시경제, 리밸런싱.

Seeding happens once, at DB-open time (alongside the app's existing `listActiveTags`/`tags` load in `App.tsx`): if `listAllTags(db)` returns an empty array, `createTag(db, name)` is called once per default tag, in the order above. This never runs again once at least one tag exists (including a user-created or later-archived one) — it's a first-run bootstrap, not a "restore defaults" feature.

## Tag management screen (new)

A new screen, `TagManagementScreen.tsx`. `src/db/tags.ts` only supports create, rename, and archive (no un-archive) — this screen exposes exactly those three operations and nothing more:

- A list of active tags (`listActiveTags`), each with inline rename (click name → text input → blur/enter saves via `renameTag`) and an archive button (`archiveTag`, removes it from the visible list immediately — archived tags stop appearing in `TagPicker` for new trades but remain attached to any trade that already used them, since `Trade.rationaleTagIds` stores IDs, not names).
- A "+ 새 태그" input + button at the bottom, calling `createTag`.
- A 홈 (home) back affordance consistent with `ChartScreen`'s pattern.

**Navigation integration**: `App.tsx`'s `screen` state (currently `'home' | 'chart'`) gains a third value, `'tags'`. Entry point: a new button on `HomeScreen.tsx`, placed next to `ThemeToggle`. Follows the exact same `pushState`/`popstate` pattern `ChartScreen` already uses (push when navigating from `'home'`, the existing `popstate` handler already generically restores whatever `screen` value is in `event.state`, so it needs only its new case added — no changes to the push/replace branching logic itself, which already keys off "coming from home" vs. not).

## Testing

- `TickerSearch.test.tsx`: a Hangul query calls `searchSymbols` synchronously (no fake-timer advance needed); a non-Hangul query still requires advancing the existing debounce timer — extends the existing fake-timer test file, doesn't replace it.
- `AddTradeSheet.test.tsx`: buy/sell button colors; save button disabled when each required field is empty in turn, enabled once all are filled with time left blank; time-unknown toggle and its tests removed; `ConvictionStars` import/usage removed from the test file too; currency-aware label text for both a KRW-quote and a USD-quote ticker; tag heading text present; manual FX-rate input is gone; entering amount-mode for a USD trade triggers `fetchFxRate`, populates `fxRateAtTrade` from its result, and disables save until it resolves; a failed fetch shows the retry message and keeps save disabled, with a retry button that calls `fetchFxRate` again.
- `api/_lib/twelveData.test.ts`: `twelveDataFxRate` requests `time_series` for `USD/KRW` with the given date, parses `values[0].close`, and walks backward on empty results the same way the existing backward-search tests in this codebase are structured.
- `api/fxrate.test.ts` (new): mirrors the existing `api/quote.test.ts` shape — 400 on missing `date`, 200 with `{ rate }` on success, 502 on failure.
- `src/api/quotes.test.ts`: `fetchFxRate` returns the parsed rate on success and `null` on failure, matching `fetchQuote`'s existing fetch-and-swallow convention (no cache tests needed — this function isn't cached).
- `TagManagementScreen.test.tsx` (new): create adds a tag visible immediately; rename updates displayed name; archive removes it from the list; the same three list-mutating operations reflected against fake/in-memory IDB (matching existing `db/tags.test.ts` patterns).
- `App.test.tsx`: extend for the new `'tags'` screen's push/pop navigation, following the existing chart-screen navigation tests' shape.
- A one-time seeding test: opening the DB with zero existing tags results in exactly the 8 named tags, in order; opening it again (or with any pre-existing tag) does not duplicate or re-seed.
