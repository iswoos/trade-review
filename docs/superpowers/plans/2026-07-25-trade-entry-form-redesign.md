# Trade Entry Form Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `AddTradeSheet.tsx` and `TickerSearch.tsx` in line with `docs/superpowers/specs/2026-07-25-trade-entry-form-redesign-design.md` — instant Korean search, required-field validation with the 시간모름/예약매매 toggle removed, tag-based rationale (replacing star ratings) with a new tag-management screen, currency-aware labels, and automatic FX-rate lookup.

**Architecture:** Mostly incremental edits to two existing components (`TickerSearch.tsx`, `AddTradeSheet.tsx`) plus one new backend endpoint (`api/fxrate.ts`) mirroring the existing `api/quote.ts`/`api/history.ts` pattern, one new screen (`TagManagementScreen.tsx`) following `ChartScreen.tsx`'s existing navigation pattern, and a one-time tag-seeding function in `src/db/tags.ts` called from `App.tsx`'s mount effect.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + Testing Library, Vercel serverless functions, `idb` (IndexedDB wrapper), Twelve Data API.

## Global Constraints

- 매수/매도 button colors (red `#dc2626` / blue `#2563eb`) are **already done** — landed on `master` in commit `ba3e09f` as part of the chart-marker redesign (`--color-buy`/`--color-sell` tokens in `src/index.css`, applied to `AddTradeSheet.tsx`'s side-toggle buttons). No task in this plan touches button color again.
- Korean-language search queries search instantly (no debounce); non-Korean queries keep the existing 500ms debounce.
- Save button reads `저장` only, colored green (`bg-accent`, unchanged).
- Remove `시간 모름 / 예약매매` entirely. Required to save: 체결 날짜, 매수/매도 (always has a default, never empty), 수량, 가격, at least one rationale tag. 체결 시각 stays optional.
- Remove `ConvictionStars` entirely; `conviction` is always saved as `null` (field stays in the `Trade` type for backward compatibility — do not restructure the schema).
- Quantity-mode toggle and its labels become currency-aware: `수량(주)` / `금액(원)` for KRW, `수량(주)` / `금액($)` for USD. Price label becomes `체결가 (원)` / `체결가 ($)`.
- 8 default rationale tags, seeded once when the tag store is empty, in this exact order: 잘 모르겠음, 익절, 손절, 실적발표, 뉴스/이슈, 기술적분석, 거시경제, 리밸런싱.
- FX rate is fetched automatically (Twelve Data `USD/KRW` forex pair) — no manual `체결 시점 환율` input.
- Node 22 is required for all test/build commands in this repo: `source ~/.nvm/nvm.sh && nvm use 22`. Run both `npx vitest run` AND `npm run build` (tsc type-check) before considering any task done — `vitest` alone does not type-check.
- Branch: `feature/trade-entry-form-redesign`, already rebased onto current `master`.

---

### Task 1: TickerSearch — Korean queries search instantly

**Files:**
- Modify: `src/components/TickerSearch.tsx`
- Test: `src/components/TickerSearch.test.tsx`

**Interfaces:**
- Consumes: `searchSymbols` from `../api/quotes` (unchanged signature).
- Produces: no new exports — `handleChange`'s behavior changes internally only.

- [ ] **Step 1: Write the failing test**

Add this test to `src/components/TickerSearch.test.tsx` (inside the existing `describe('TickerSearch', ...)` block, alongside the existing debounce test):

```tsx
  it('searches instantly (no debounce) for a Korean-language query', async () => {
    vi.mocked(quotes.searchSymbols).mockClear();
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: '005930', name: '삼성전자', exchange: 'KRX' }]);

    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('종목 검색'), { target: { value: '삼성' } });

    // No timer advance — searchSymbols must have already been called synchronously.
    expect(quotes.searchSymbols).toHaveBeenCalledWith('삼성');
    expect(await screen.findByRole('button', { name: /삼성전자 \(005930\)/ })).toBeInTheDocument();
  });

  it('still debounces a non-Korean query even after a prior Korean-language search', async () => {
    vi.useFakeTimers();
    vi.mocked(quotes.searchSymbols).mockClear();
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);

    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);
    const input = screen.getByLabelText('종목 검색');

    fireEvent.change(input, { target: { value: 'j' } });
    expect(quotes.searchSymbols).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(quotes.searchSymbols).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/TickerSearch.test.tsx
```

Expected: the new "searches instantly" test FAILS (no call to `searchSymbols` before the timer advances, since the current code always debounces).

- [ ] **Step 3: Implement**

In `src/components/TickerSearch.tsx`, add a Hangul-detection helper (same regex already used in `api/search.ts`) and branch `handleChange` on it:

```tsx
const HANGUL_PATTERN = /[ㄱ-ㆎ가-힣]/;

function isHangulQuery(text: string): boolean {
  return HANGUL_PATTERN.test(text);
}
```

Replace `handleChange`:

```tsx
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
    if (isHangulQuery(next)) {
      void runSearch(next);
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      void runSearch(next);
    }, SEARCH_DEBOUNCE_MS);
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/TickerSearch.test.tsx
npm run build
```

Expected: all `TickerSearch.test.tsx` tests PASS (including the pre-existing debounce test — a non-Korean query is unaffected), and `npm run build` has no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/TickerSearch.tsx src/components/TickerSearch.test.tsx
git commit -m "feat: 한글 검색어는 디바운스 없이 즉시 검색"
```

---

### Task 2: Default rationale tags — seed once, wire into App

**Files:**
- Modify: `src/db/tags.ts`
- Modify: `src/App.tsx`
- Test: `src/db/tags.test.ts`

**Interfaces:**
- Produces: `seedDefaultTags(db: IDBPDatabase<TradeReviewDB>): Promise<void>` — exported from `src/db/tags.ts`. Later tasks (3, 4, 9) rely on `App.tsx`'s `tags` state being pre-populated with these 8 tags on first run, so this must land before any task that requires selecting a tag to save (Task 3 onward).

**Why this comes before Task 3:** Task 3 makes "at least one rationale tag" a hard requirement to save. Every existing test that saves a trade through `App` (in `App.test.tsx`) needs a real tag to click — this task guarantees one exists as soon as the app mounts.

- [ ] **Step 1: Write the failing test**

Add to `src/db/tags.test.ts` (new `describe` block, same file, same `db`/`beforeEach`/`afterEach` already in place):

```ts
describe('seedDefaultTags', () => {
  it('creates the 8 default tags, in order, when the tag store is empty', async () => {
    await seedDefaultTags(db);
    const all = await listAllTags(db);
    expect(all.map((t) => t.name)).toEqual([
      '잘 모르겠음', '익절', '손절', '실적발표', '뉴스/이슈', '기술적분석', '거시경제', '리밸런싱',
    ]);
  });

  it('does not seed again (or duplicate) if any tag already exists', async () => {
    await createTag(db, '기존태그');
    await seedDefaultTags(db);
    const all = await listAllTags(db);
    expect(all.map((t) => t.name)).toEqual(['기존태그']);
  });
});
```

Update the file's import line to include the new function:

```ts
import { createTag, renameTag, archiveTag, listActiveTags, listAllTags, seedDefaultTags } from './tags';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/db/tags.test.ts
```

Expected: FAIL with `seedDefaultTags is not a function` (or a TypeScript error on the import).

- [ ] **Step 3: Implement**

Append to `src/db/tags.ts`:

```ts
const DEFAULT_TAG_NAMES = [
  '잘 모르겠음', '익절', '손절', '실적발표', '뉴스/이슈', '기술적분석', '거시경제', '리밸런싱',
];

export async function seedDefaultTags(db: IDBPDatabase<TradeReviewDB>): Promise<void> {
  const existing = await listAllTags(db);
  if (existing.length > 0) return;
  for (const name of DEFAULT_TAG_NAMES) {
    await createTag(db, name);
  }
}
```

In `src/App.tsx`, import it and call it before loading tags in the mount effect:

```tsx
import { listActiveTags, seedDefaultTags } from './db/tags';
```

```tsx
  useEffect(() => {
    requestPersistentStorage();
    openTradeReviewDB().then(async (opened) => {
      setDb(opened);
      await seedDefaultTags(opened);
      setTags(await listActiveTags(opened));
      await reloadPositions(opened);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/db/tags.test.ts
npm run build
```

Expected: PASS. Also run the full suite once here since `App.tsx` changed:

```bash
npx vitest run
```

Expected: all existing tests still PASS — no existing test asserts on `tags` being empty at mount, so this is additive only.

- [ ] **Step 5: Commit**

```bash
git add src/db/tags.ts src/db/tags.test.ts src/App.tsx
git commit -m "feat: 기본 매매 근거 태그 8개 최초 실행 시 자동 생성"
```

---

### Task 3: AddTradeSheet — remove 시간모름/예약매매, add required-field validation, rename save button

**Files:**
- Modify: `src/components/AddTradeSheet.tsx`
- Test: `src/components/AddTradeSheet.test.tsx`
- Modify (test fixups): `src/App.test.tsx`

**Interfaces:**
- Consumes: `seedDefaultTags`/`listActiveTags` wiring from Task 2 (guarantees `tags` is non-empty by the time `App.tsx` renders `AddTradeSheet`).
- Produces: submit `<button>`'s accessible name changes from `저장 · 평단 자동계산` to `저장`. This name is relied on by Task 4, Task 8, and `App.test.tsx`.

**Why button-label + validation are one task:** both touch the same `<button type="submit">` element and its `disabled` logic; splitting them would mean two passes over one element for no review benefit.

- [ ] **Step 1: Write the failing tests**

Replace `src/components/AddTradeSheet.test.tsx` in full with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTag } from '../db/tags';
import { AddTradeSheet } from './AddTradeSheet';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes');

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  db = await openTradeReviewDB();
  vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 11.36, currency: 'USD' });
});

afterEach(() => {
  db.close();
});

describe('AddTradeSheet', () => {
  it('prefills the fill price from a live quote for the given ticker', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
  });

  it('saves a trade for the given ticker with a tag, and reports it via onSaved', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.ticker).toBe('JOBY');
    expect(saved.quantity).toBe(100);
    expect(saved.rationaleTagIds).toEqual([tag.id]);
    expect(saved.datetimeUnknown).toBe(false);
  });

  it('disables save until date, price, quantity, and at least one tag are all filled in', async () => {
    const tag = await createTag(db, '팩트');
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={vi.fn()} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜') as HTMLInputElement;
    const saveButton = screen.getByRole('button', { name: '저장' });

    // Date defaults to today and price is prefilled, but quantity and tag are still empty.
    expect(saveButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    expect(saveButton).toBeDisabled(); // quantity filled, still no tag

    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(saveButton).not.toBeDisabled(); // all required fields present, time left blank

    await userEvent.clear(dateInput);
    expect(saveButton).toBeDisabled(); // date cleared
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={onClose} />);
    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('combines date and time into the saved datetime when a time is provided', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2025-07-10');
    await userEvent.type(screen.getByLabelText('체결 시각'), '09:30');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBe(new Date('2025-07-10T09:30').toISOString());
  });

  it('saves date-only (midnight) when the time field is left blank', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜') as HTMLInputElement;
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBe(new Date(dateInput.value).toISOString());
  });
});
```

Note what's gone: both tests about `시간 모름 / 예약매매` (toggling it on, clearing date/time fields), and the old "allows saving with no tag..." test (superseded by the new disabled-button test, since a tag is now required).

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/AddTradeSheet.test.tsx
```

Expected: FAIL — button name `저장` doesn't exist yet (still `저장 · 평단 자동계산`), and it's never disabled.

- [ ] **Step 3: Implement**

In `src/components/AddTradeSheet.tsx`:

Remove the `datetimeUnknown` state and its toggle function:

```tsx
  const [datetimeValue, setDatetimeValue] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeValue, setTimeValue] = useState('');
```

(delete the `datetimeUnknown` state line and the entire `toggleDatetimeUnknown` function)

Update `handleSave`:

```tsx
  async function handleSave() {
    const trade = await createTrade(db, {
      ticker,
      market: currency === 'KRW' ? 'KR' : 'US',
      name,
      currency,
      datetime: new Date(timeValue ? `${datetimeValue}T${timeValue}` : datetimeValue).toISOString(),
      datetimeUnknown: false,
      side,
      price: Number(price),
      quantityType,
      quantityValue: Number(quantityValue),
      fxRateAtTrade: quantityType === 'amount' && currency !== 'KRW' ? Number(fxRateAtTrade) : null,
      rationaleTagIds: tagIds,
      conviction,
      memo,
      attachment: null,
    });
    onSaved(trade);
  }
```

Remove the date/time inputs' `disabled={datetimeUnknown}` attributes and delete the toggle button entirely:

```tsx
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          체결 날짜
          <input
            aria-label="체결 날짜"
            type="date"
            value={datetimeValue}
            onChange={(e) => setDatetimeValue(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          체결 시각 (선택)
          <input
            aria-label="체결 시각"
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
```

(the `<button ... 시간 모름 / 예약매매 </button>` that followed is deleted entirely)

Update the submit button:

```tsx
        <button
          type="submit"
          disabled={
            !datetimeValue ||
            !price.trim() ||
            !quantityValue.trim() ||
            tagIds.length === 0 ||
            (quantityType === 'amount' && currency !== 'KRW' && !fxRateAtTrade)
          }
          className="rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-40"
        >
          저장
        </button>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/AddTradeSheet.test.tsx
npm run build
```

Expected: PASS. `npm run build` will likely still succeed even before fixing `App.test.tsx` (that file's failures are runtime test failures, not type errors) — but run the full suite next to confirm:

```bash
npx vitest run
```

Expected: `App.test.tsx` FAILS — its trade-saving tests click a button named `저장 · 평단 자동계산` that no longer exists, and never select a tag (now required).

- [ ] **Step 5: Fix `App.test.tsx`**

In `src/App.test.tsx`, update the two tests that save a trade. Replace the `'shows the avg-cost line...'` test's save sequence:

```tsx
    await userEvent.click(screen.getByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(await screen.findByRole('button', { name: '잘 모르겠음' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
```

Replace the `'excludes a fully-closed position...'` test's two save sequences:

```tsx
    // buy 10 shares
    await userEvent.click(await screen.findByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(await screen.findByRole('button', { name: '잘 모르겠음' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument());

    // sell all 10 shares to close the position
    await userEvent.click(screen.getByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.click(screen.getByRole('button', { name: '매도' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(await screen.findByRole('button', { name: '잘 모르겠음' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument());
```

- [ ] **Step 6: Run the full suite to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run
npm run build
```

Expected: all tests PASS, build clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/AddTradeSheet.tsx src/components/AddTradeSheet.test.tsx src/App.test.tsx
git commit -m "feat: 시간모름/예약매매 제거, 필수 입력값 검증 추가, 저장 버튼 문구 변경"
```

---

### Task 4: AddTradeSheet — remove ConvictionStars, add tag heading, currency-aware labels

**Files:**
- Modify: `src/components/AddTradeSheet.tsx`
- Test: `src/components/AddTradeSheet.test.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: price input's accessible name changes from `체결가` to `체결가 (원)`/`체결가 ($)` — no later task depends on the old name (confirmed via grep, no other test file references it).

- [ ] **Step 1: Write the failing tests**

Add to `src/components/AddTradeSheet.test.tsx` (new tests, inside the existing `describe` block):

```tsx
  it('shows a visible "매수/매도 이유" heading above the tag picker', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
    expect(screen.getByText('매수/매도 이유')).toBeInTheDocument();
  });

  it('shows USD currency-aware price/quantity labels for a USD-quoted ticker (default)', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
    expect(screen.getByLabelText('체결가 ($)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수량(주)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '금액($)' })).toBeInTheDocument();
  });

  it('shows KRW currency-aware price/quantity labels for a KRW-quoted ticker', async () => {
    vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 71000, currency: 'KRW' });
    render(<AddTradeSheet db={db} ticker="005930" name="삼성전자" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('71000');
    expect(screen.getByLabelText('체결가 (원)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '금액(원)' })).toBeInTheDocument();
  });

  it('does not render a conviction star rating', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('11.36');
    expect(screen.queryByRole('radiogroup', { name: '확신도' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/AddTradeSheet.test.tsx
```

Expected: the 4 new tests FAIL (heading text absent, labels still `체결가`/`주`/`원`, `확신도` radiogroup still present); all pre-existing tests still PASS.

- [ ] **Step 3: Implement**

In `src/components/AddTradeSheet.tsx`, remove the `ConvictionStars` import and its state/element:

```tsx
import { TagPicker } from './TagPicker';
import { fetchQuote } from '../api/quotes';
```

(delete the `import { ConvictionStars } from './ConvictionStars';` line)

Remove the `conviction` state entirely and pass `null` directly in `handleSave`:

```tsx
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [memo, setMemo] = useState('');
```

(delete `const [conviction, setConviction] = useState<number | null>(null);`)

In `handleSave`, change `conviction,` to `conviction: null,`.

Update the quantity-mode toggle buttons:

```tsx
        <div role="radiogroup" aria-label="수량 단위" className="flex gap-2">
          <button
            type="button"
            aria-pressed={quantityType === 'shares'}
            onClick={() => setQuantityType('shares')}
            className={
              quantityType === 'shares'
                ? 'flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            수량(주)
          </button>
          <button
            type="button"
            aria-pressed={quantityType === 'amount'}
            onClick={() => setQuantityType('amount')}
            className={
              quantityType === 'amount'
                ? 'flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            {currency === 'KRW' ? '금액(원)' : '금액($)'}
          </button>
        </div>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          {quantityType === 'shares' ? '수량(주)' : currency === 'KRW' ? '금액(원)' : '금액($)'}
          <input
            aria-label="수량 또는 금액"
            value={quantityValue}
            onChange={(e) => setQuantityValue(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
```

Update the price input's label and aria-label together (keep them in sync — this is the input whose `aria-label` was previously the static string `체결가`):

```tsx
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          {currency === 'KRW' ? '체결가 (원)' : '체결가 ($)'}
          <input
            aria-label={currency === 'KRW' ? '체결가 (원)' : '체결가 ($)'}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
```

Add the visible tag heading and remove `ConvictionStars`:

```tsx
        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">매수/매도 이유</p>
        <TagPicker tags={availableTags} selectedIds={tagIds} onChange={setTagIds} />
```

(delete the `<ConvictionStars value={conviction} onChange={setConviction} />` line that followed `TagPicker` previously)

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/AddTradeSheet.test.tsx
npm run build
```

Expected: PASS, build clean (removing the `conviction` state/import must not leave any unused-variable TS errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/AddTradeSheet.tsx src/components/AddTradeSheet.test.tsx
git commit -m "feat: 확신도 별점 제거하고 태그 소제목 추가, 통화별 수량/가격 라벨 적용"
```

---

### Task 5: twelveDataFxRate — USD/KRW historical rate lookup

**Files:**
- Modify: `api/_lib/twelveData.ts`
- Test: `api/_lib/twelveData.test.ts`

**Interfaces:**
- Consumes: existing `twelveDataFetch` helper and `TwelveDataTimeSeriesResponse`/`TwelveDataTimeSeriesValue` interfaces already in this file (same shape as `time_series` used by `twelveDataHistory`).
- Produces: `twelveDataFxRate(date: string): Promise<number>` — throws if no rate is found in the lookback window. Consumed by Task 6's `api/fxrate.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `api/_lib/twelveData.test.ts` (new `describe` block):

```ts
describe('twelveDataFxRate', () => {
  it('returns the closing USD/KRW rate nearest to (on or before) the given date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          values: [
            { datetime: '2026-07-18', open: '1350', high: '1360', low: '1345', close: '1352.5' },
            { datetime: '2026-07-17', open: '1348', high: '1355', low: '1340', close: '1350.0' },
          ],
        }),
      })
    );
    const rate = await twelveDataFxRate('2026-07-18');
    expect(rate).toBe(1352.5);
  });

  it('requests a 7-day lookback window ending on the given date, for USD/KRW', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ values: [{ datetime: '2026-07-18', open: '1350', high: '1360', low: '1345', close: '1352.5' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await twelveDataFxRate('2026-07-18');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toContain('/time_series');
    expect(url.searchParams.get('symbol')).toBe('USD/KRW');
    expect(url.searchParams.get('start_date')).toBe('2026-07-11');
    expect(url.searchParams.get('end_date')).toBe('2026-07-18');
  });

  it('throws when no rate is available in the lookback window', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ values: [] }) }));
    await expect(twelveDataFxRate('2026-07-18')).rejects.toThrow();
  });
});
```

Update this file's import line:

```ts
import { twelveDataQuote, twelveDataHistory, twelveDataSearch, twelveDataFxRate } from './twelveData';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run api/_lib/twelveData.test.ts
```

Expected: FAIL — `twelveDataFxRate` is not exported yet.

- [ ] **Step 3: Implement**

Append to `api/_lib/twelveData.ts`:

```ts
export async function twelveDataFxRate(date: string): Promise<number> {
  const to = new Date(date);
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  const data = (await twelveDataFetch('time_series', {
    symbol: 'USD/KRW',
    interval: '1day',
    start_date: from.toISOString().slice(0, 10),
    end_date: date,
  })) as TwelveDataTimeSeriesResponse;
  if (data.values.length === 0) {
    throw new Error(`No USD/KRW rate available near ${date}`);
  }
  return Number(data.values[0].close);
}
```

(`data.values` is newest-first, same as every other Twelve Data `time_series` response in this file — since `end_date` caps the range at the target date, `values[0]` is the nearest trading day at or before it. This mirrors `dataGoKrQuote`'s existing pattern in `api/_lib/dataGoKr.ts`: fetch a small batch without pinning to one exact day, then take the nearest available row, rather than a live retry loop.)

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
git commit -m "feat: Twelve Data USD/KRW 환율 조회 함수 추가"
```

---

### Task 6: api/fxrate.ts — new endpoint

**Files:**
- Create: `api/fxrate.ts`
- Test: `api/fxrate.test.ts`

**Interfaces:**
- Consumes: `twelveDataFxRate(date: string): Promise<number>` from Task 5.
- Produces: `GET /api/fxrate?date=YYYY-MM-DD` → `{ rate: number }` on success, `400` on missing `date`, `502` on lookup failure. Consumed by Task 7's `fetchFxRate`.

- [ ] **Step 1: Write the failing tests**

Create `api/fxrate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler from './fxrate';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  process.env.TWELVE_DATA_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /api/fxrate', () => {
  it('returns 400 when date is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns the fetched rate on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ values: [{ datetime: '2026-07-18', open: '1350', high: '1360', low: '1345', close: '1352.5' }] }),
      })
    );
    const res = mockRes();
    await handler({ query: { date: '2026-07-18' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ rate: 1352.5 });
  });

  it('returns 502 when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const res = mockRes();
    await handler({ query: { date: '2026-07-18' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run api/fxrate.test.ts
```

Expected: FAIL — `./fxrate` module doesn't exist yet.

- [ ] **Step 3: Implement**

Create `api/fxrate.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { twelveDataFxRate } from './_lib/twelveData.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const date = req.query.date;
  if (typeof date !== 'string' || date.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "date"' });
    return;
  }
  try {
    const rate = await twelveDataFxRate(date);
    res.status(200).json({ rate });
  } catch {
    res.status(502).json({ error: 'FX rate lookup failed' });
  }
}
```

(no route registration needed — Vercel auto-detects any file directly under `api/` as a serverless function by filename, same as `api/quote.ts`/`api/history.ts`)

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run api/fxrate.test.ts
npm run build
```

Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add api/fxrate.ts api/fxrate.test.ts
git commit -m "feat: /api/fxrate 엔드포인트 추가"
```

---

### Task 7: fetchFxRate — client-side fetch helper

**Files:**
- Modify: `src/api/quotes.ts`
- Test: `src/api/quotes.test.ts`

**Interfaces:**
- Consumes: `GET /api/fxrate?date=...` from Task 6.
- Produces: `fetchFxRate(date: string): Promise<number | null>` — consumed by Task 8's `AddTradeSheet.tsx` wiring.

- [ ] **Step 1: Write the failing tests**

Add to `src/api/quotes.test.ts`:

```ts
describe('fetchFxRate', () => {
  it('returns the parsed rate on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rate: 1352.5 }) }));
    const result = await fetchFxRate('2026-07-18');
    expect(result).toBe(1352.5);
  });

  it('falls back to null on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchFxRate('2026-07-18');
    expect(result).toBeNull();
  });

  it('falls back to null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const result = await fetchFxRate('2026-07-18');
    expect(result).toBeNull();
  });
});
```

Update this file's import line:

```ts
import { searchSymbols, fetchQuote, fetchHistory, fetchFxRate } from './quotes';
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/api/quotes.test.ts
```

Expected: FAIL — `fetchFxRate` is not exported yet.

- [ ] **Step 3: Implement**

Append to `src/api/quotes.ts`:

```ts
export async function fetchFxRate(date: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/fxrate?date=${encodeURIComponent(date)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { rate: number };
    return data.rate;
  } catch {
    return null;
  }
}
```

(no cache — this is a low-frequency, one-shot fetch per trade entry, unlike `fetchQuote`/`fetchHistory` which are hit repeatedly for the same symbol)

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/api/quotes.test.ts
npm run build
```

Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/quotes.ts src/api/quotes.test.ts
git commit -m "feat: fetchFxRate 클라이언트 함수 추가"
```

---

### Task 8: AddTradeSheet — FX rate auto-fetch (replaces manual entry)

**Files:**
- Modify: `src/components/AddTradeSheet.tsx`
- Test: `src/components/AddTradeSheet.test.tsx`

**Interfaces:**
- Consumes: `fetchFxRate(date: string): Promise<number | null>` from Task 7.
- Produces: `fxRateAtTrade` internal state changes type from `string` to `number | null` — this is purely internal to the component, no other file reads this state directly.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/AddTradeSheet.test.tsx`:

```tsx
  it('auto-fetches and displays the FX rate when switching to amount mode for a USD-quoted ticker, and saves it', async () => {
    vi.mocked(quotes.fetchFxRate).mockResolvedValue(1352.5);
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '금액($)' }));
    await screen.findByText('체결 시점 환율: 1352.5');

    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(onSaved.mock.calls[0][0].fxRateAtTrade).toBe(1352.5);
  });

  it('shows a retry message and keeps save disabled when the FX rate fetch fails, and recovers on retry', async () => {
    vi.mocked(quotes.fetchFxRate).mockResolvedValue(null);
    const tag = await createTag(db, '팩트');
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[tag]} onSaved={vi.fn()} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '금액($)' }));
    await screen.findByText('환율 조회 실패');

    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    vi.mocked(quotes.fetchFxRate).mockResolvedValue(1350);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await screen.findByText('체결 시점 환율: 1350');
    expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled();
  });

  it('does not show any FX rate UI for a KRW trade, even in amount mode', async () => {
    vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 71000, currency: 'KRW' });
    render(<AddTradeSheet db={db} ticker="005930" name="삼성전자" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);
    await screen.findByDisplayValue('71000');
    await userEvent.click(screen.getByRole('button', { name: '금액(원)' }));
    expect(screen.queryByText('환율 조회 실패')).not.toBeInTheDocument();
    expect(quotes.fetchFxRate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/AddTradeSheet.test.tsx
```

Expected: FAIL — there's no FX-rate UI text yet, and `fetchFxRate` is never called from this component.

- [ ] **Step 3: Implement**

In `src/components/AddTradeSheet.tsx`, change the import and the `fxRateAtTrade` state:

```tsx
import { fetchQuote, fetchFxRate } from '../api/quotes';
```

```tsx
  const [fxRateAtTrade, setFxRateAtTrade] = useState<number | null>(null);
  const [fxRateLoading, setFxRateLoading] = useState(false);
  const [fxRateFailed, setFxRateFailed] = useState(false);
```

Add a new effect (after the existing `fetchQuote` effect) that fetches the rate whenever amount-mode + non-KRW + a date are all set:

```tsx
  useEffect(() => {
    if (quantityType !== 'amount' || currency === 'KRW' || !datetimeValue) {
      setFxRateAtTrade(null);
      setFxRateFailed(false);
      setFxRateLoading(false);
      return;
    }
    let cancelled = false;
    setFxRateLoading(true);
    setFxRateFailed(false);
    fetchFxRate(datetimeValue).then((rate) => {
      if (cancelled) return;
      setFxRateLoading(false);
      if (rate == null) {
        setFxRateFailed(true);
        setFxRateAtTrade(null);
      } else {
        setFxRateAtTrade(rate);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [quantityType, currency, datetimeValue]);

  function retryFxRate() {
    if (!datetimeValue) return;
    setFxRateFailed(false);
    setFxRateLoading(true);
    fetchFxRate(datetimeValue).then((rate) => {
      setFxRateLoading(false);
      if (rate == null) {
        setFxRateFailed(true);
      } else {
        setFxRateAtTrade(rate);
      }
    });
  }
```

Update `handleSave`'s `fxRateAtTrade` line (no longer a string needing `Number()`):

```tsx
      fxRateAtTrade: quantityType === 'amount' && currency !== 'KRW' ? fxRateAtTrade : null,
```

Replace the manual `체결 시점 환율` input block with:

```tsx
        {quantityType === 'amount' && currency !== 'KRW' && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {fxRateLoading && <p>환율 조회 중...</p>}
            {fxRateFailed && (
              <div className="flex items-center gap-2">
                <p className="text-loss">환율 조회 실패</p>
                <button
                  type="button"
                  onClick={retryFxRate}
                  className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-700"
                >
                  다시 시도
                </button>
              </div>
            )}
            {fxRateAtTrade != null && !fxRateLoading && <p>체결 시점 환율: {fxRateAtTrade}</p>}
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/AddTradeSheet.test.tsx
npm run build
```

Expected: PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/AddTradeSheet.tsx src/components/AddTradeSheet.test.tsx
git commit -m "feat: 체결 시점 환율 자동조회로 대체 (수동 입력 필드 제거)"
```

---

### Task 9: TagManagementScreen — new screen + navigation integration

**Files:**
- Create: `src/components/TagManagementScreen.tsx`
- Test: `src/components/TagManagementScreen.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/HomeScreen.tsx`
- Modify (test fixups): `src/App.test.tsx`, `src/components/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `listActiveTags`, `createTag`, `renameTag`, `archiveTag` from `src/db/tags.ts` (all pre-existing).
- Produces: `TagManagementScreen({ db, onBack }): JSX.Element`. `App.tsx`'s `screen` state widens to `'home' | 'chart' | 'tags'`. `HomeScreen` gains a required `onOpenTagManagement: () => void` prop.

- [ ] **Step 1: Write the failing tests**

Create `src/components/TagManagementScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTag } from '../db/tags';
import { TagManagementScreen } from './TagManagementScreen';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  db = await openTradeReviewDB();
});

afterEach(() => {
  db.close();
});

describe('TagManagementScreen', () => {
  it('creates a new tag and shows it in the list immediately', async () => {
    render(<TagManagementScreen db={db} onBack={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('새 태그 이름'), '장기투자');
    await userEvent.click(screen.getByRole('button', { name: '+ 새 태그' }));
    expect(await screen.findByText('장기투자')).toBeInTheDocument();
  });

  it('renames a tag inline and shows the updated name', async () => {
    const tag = await createTag(db, '감');
    render(<TagManagementScreen db={db} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: tag.name }));
    const input = screen.getByLabelText('감 이름 수정');
    await userEvent.clear(input);
    await userEvent.type(input, '직감{Enter}');
    expect(await screen.findByText('직감')).toBeInTheDocument();
    expect(screen.queryByText('감')).not.toBeInTheDocument();
  });

  it('archives a tag and removes it from the visible list', async () => {
    await createTag(db, '지인추천');
    render(<TagManagementScreen db={db} onBack={vi.fn()} />);
    await screen.findByText('지인추천');
    await userEvent.click(screen.getByRole('button', { name: '지인추천 보관' }));
    await waitFor(() => expect(screen.queryByText('지인추천')).not.toBeInTheDocument());
  });

  it('calls onBack when the home button is clicked', async () => {
    const onBack = vi.fn();
    render(<TagManagementScreen db={db} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: '홈' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
```

Add to `src/components/HomeScreen.test.tsx`: pass `onOpenTagManagement={vi.fn()}` to every existing `<HomeScreen ... />` render call in this file (5 call sites), and add:

```tsx
  it('calls onOpenTagManagement when the tag management button is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onOpenTagManagement = vi.fn();
    render(
      <HomeScreen
        positions={[]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={vi.fn()}
        onOpenTagManagement={onOpenTagManagement}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: '태그 관리' }));
    expect(onOpenTagManagement).toHaveBeenCalledOnce();
  });
```

Add to `src/App.test.tsx`:

```tsx
  it('navigates to the tag management screen and back via the home button', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '태그 관리' }));
    expect(await screen.findByRole('list', { name: '태그 목록' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '홈' }));
    await waitFor(() => expect(screen.getByRole('list', { name: '보유 주식 목록' })).toBeInTheDocument());
  });

  it('a tag created in tag management is available for selection in a newly opened trade form', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: '태그 관리' }));
    await userEvent.type(await screen.findByLabelText('새 태그 이름'), '장기투자');
    await userEvent.click(screen.getByRole('button', { name: '+ 새 태그' }));
    await screen.findByText('장기투자');

    await userEvent.click(screen.getByRole('button', { name: '홈' }));
    await waitFor(() => expect(screen.getByRole('list', { name: '보유 주식 목록' })).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await userEvent.click(await screen.findByRole('button', { name: '+ 매매 기록 추가' }));

    expect(await screen.findByRole('button', { name: '장기투자' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run src/components/TagManagementScreen.test.tsx src/components/HomeScreen.test.tsx src/App.test.tsx
```

Expected: `TagManagementScreen.test.tsx` FAILS (module doesn't exist), `HomeScreen.test.tsx` FAILS (TypeScript error — missing required prop, and the new "태그 관리" button test), `App.test.tsx` FAILS (no "태그 관리" button exists yet).

- [ ] **Step 3: Implement `TagManagementScreen.tsx`**

Create `src/components/TagManagementScreen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Tag } from '../types';
import { listActiveTags, createTag, renameTag, archiveTag } from '../db/tags';

interface TagManagementScreenProps {
  db: IDBPDatabase<TradeReviewDB>;
  onBack: () => void;
}

export function TagManagementScreen({ db, onBack }: TagManagementScreenProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newTagName, setNewTagName] = useState('');

  async function reload() {
    setTags(await listActiveTags(db));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  function startEditing(tag: Tag) {
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  async function commitRename() {
    if (editingId && editingName.trim()) {
      await renameTag(db, editingId, editingName.trim());
      await reload();
    }
    setEditingId(null);
  }

  async function handleArchive(id: string) {
    await archiveTag(db, id);
    await reload();
  }

  async function handleCreate() {
    if (!newTagName.trim()) return;
    await createTag(db, newTagName.trim());
    setNewTagName('');
    await reload();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="홈"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          ⌂
        </button>
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">태그 관리</h2>
      </div>

      <ul aria-label="태그 목록" className="flex flex-col gap-2">
        {tags.map((tag) => (
          <li
            key={tag.id}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            {editingId === tag.id ? (
              <input
                aria-label={`${tag.name} 이름 수정`}
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                }}
                autoFocus
                className="flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            ) : (
              <button
                type="button"
                onClick={() => startEditing(tag)}
                className="flex-1 text-left text-sm text-zinc-800 dark:text-zinc-200"
              >
                {tag.name}
              </button>
            )}
            <button
              type="button"
              aria-label={`${tag.name} 보관`}
              onClick={() => handleArchive(tag.id)}
              className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              보관
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          aria-label="새 태그 이름"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          placeholder="새 태그"
          className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <button
          type="button"
          onClick={handleCreate}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white"
        >
          + 새 태그
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `HomeScreen.tsx`**

Add the new prop and a button next to `ThemeToggle`:

```tsx
interface HomeScreenProps {
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onSelectTicker: (ticker: string, name: string) => void;
  onOpenTagManagement: () => void;
}
```

```tsx
export function HomeScreen({
  positions,
  sortOrder,
  onSortOrderChange,
  onSelectTicker,
  onOpenTagManagement,
}: HomeScreenProps) {
```

```tsx
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        </div>
        <button
          type="button"
          onClick={onOpenTagManagement}
          aria-label="태그 관리"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
        >
          🏷️
        </button>
        <ThemeToggle />
      </div>
```

- [ ] **Step 5: Wire `App.tsx`**

```tsx
import { TagManagementScreen } from './components/TagManagementScreen';
```

```tsx
  const [screen, setScreen] = useState<'home' | 'chart' | 'tags'>('home');
```

```tsx
  useEffect(() => {
    window.history.replaceState({ screen: 'home' }, '');
    function handlePopState(event: PopStateEvent) {
      const state = event.state as
        | { screen: 'home' }
        | { screen: 'chart'; ticker: string; name: string }
        | { screen: 'tags' }
        | null;
      if (!state || state.screen === 'home') {
        setScreen('home');
        return;
      }
      if (state.screen === 'tags') {
        setScreen('tags');
        return;
      }
      setActiveTicker(state.ticker);
      setActiveName(state.name);
      setScreen('chart');
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
```

```tsx
  function handleOpenTagManagement() {
    window.history.pushState({ screen: 'tags' }, '');
    setScreen('tags');
  }

  async function handleCloseTagManagement() {
    if (db) setTags(await listActiveTags(db));
    window.history.back();
  }
```

```tsx
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {screen === 'home' && (
        <HomeScreen
          positions={positionItems}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onSelectTicker={handleSelectTicker}
          onOpenTagManagement={handleOpenTagManagement}
        />
      )}
      {screen === 'chart' && activeTicker && (
        <ChartScreen
          db={db}
          ticker={activeTicker}
          name={activeName}
          tags={tags}
          positions={positionItems}
          sortOrder={sortOrder}
          onSelectTicker={handleSelectTicker}
          onTradeSaved={handleTradeSaved}
        />
      )}
      {screen === 'tags' && (
        <TagManagementScreen db={db} onBack={handleCloseTagManagement} />
      )}
    </main>
  );
```

(`handleCloseTagManagement` re-fetches `tags` before navigating back via the in-app 홈 button, so any tag created/renamed/archived in the management screen is immediately reflected the next time `AddTradeSheet` renders — this covers the in-app back button; the browser's native back button falls through to `handlePopState`, which does not refresh `tags`, matching this codebase's pre-existing pattern where `tags` is otherwise only ever set once at mount.)

- [ ] **Step 6: Run tests to verify they pass**

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run
npm run build
```

Expected: all tests PASS (including the full suite, to catch anything the new required `HomeScreen` prop broke elsewhere), build clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/TagManagementScreen.tsx src/components/TagManagementScreen.test.tsx \
  src/App.tsx src/App.test.tsx src/components/HomeScreen.tsx src/components/HomeScreen.test.tsx
git commit -m "feat: 태그 관리 화면 추가 (생성/이름변경/보관) 및 홈 화면 진입점 연결"
```

---

## Final check (whole branch)

After Task 9, run the complete verification once more from the repo root:

```bash
source ~/.nvm/nvm.sh && nvm use 22
npx vitest run
npm run build
```

Expected: all tests pass, build clean. Then proceed to `superpowers:finishing-a-development-branch`.
