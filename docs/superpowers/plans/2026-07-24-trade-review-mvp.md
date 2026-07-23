# Trade Review MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP of the 매매 복기 (Trade Review) mobile web app: a trade-entry screen (S2) and a per-ticker detail screen (S3, chart + list tabs) with automatic average-cost calculation, backed by browser-local IndexedDB storage and a thin Vercel serverless price proxy.

**Architecture:** A single Vite + React + TypeScript SPA deployed as a static site on Vercel, with a root-level `/api` folder containing three Vercel Serverless Functions (Node runtime) that call `yahoo-finance2` server-side to avoid the browser CORS/key-exposure problems documented in ADR-0003/0005. All trade data lives in the browser's IndexedDB (via the `idb` wrapper); `Position` is never stored, only derived from `Trade` records on read. Frontend and API live in one repository/one Vercel project (ADR-0007).

**Tech Stack:** Vite, React 18, TypeScript, `idb` (IndexedDB), `lightweight-charts` v4 (price chart), `yahoo-finance2` (Node, inside `/api` only), Vitest + Testing Library + `fake-indexeddb` for tests, deployed on Vercel.

## Global Constraints

- Platform: mobile web, responsive, mobile-first. No native app. (기획서 1, 12절)
- No standing server. Only the three `/api` price-proxy functions run server-side, and only on request (ADR-0003).
- `평단`(avg cost) is always computed and stored in the ticker's native trading currency, never in KRW (ADR-0001).
- A sell never changes `avgCost`; it only reduces `totalQuantity` and adds to `realizedPl` (ADR-0002).
- Rationale tags are referenced by ID, never stored as raw strings. Deleting a tag archives it (`archived: true`); it never hard-deletes (ADR-0004).
- Price data source is `yahoo-finance2`, called only from `/api/*`, never fetched directly from the browser (ADR-0005/0006).
- `recorded_at` is stamped automatically on every `Trade` at creation and is never shown in any UI (ADR-0006, wellbeing principle).
- Any "fill in the rationale" prompt uses observational, non-judgmental phrasing (e.g. "이 매매, 기억나는 이유가 있나요?") and never blocks saving or penalizes an empty field (기획서 3절 4~6번, CONTEXT.md "채우기 유도").
- Do not build: TradingView-level charting/indicators, real-time quotes, buy/sell recommendations, cross-user rankings, DCA/chase-buying nudges, or S0/S1/S4/S5/persona badges/multi-account/cloud sync. Leave `// TODO(후속):` comments instead of building these.
- `CONTEXT.md` and `docs/adr/` are gitignored — read them locally for context but never assume they exist in a fresh clone.

---

## File Structure

```
/
├── api/
│   ├── search.ts        — GET /api/search?q=  → symbol search
│   ├── quote.ts          — GET /api/quote?symbol= → current price + currency
│   └── history.ts        — GET /api/history?symbol= → 1y daily close bars
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts                    — Trade, Tag, Position, shared types
│   ├── lib/
│   │   ├── quantity.ts             — currency/quantity resolution (pure)
│   │   ├── quantity.test.ts
│   │   ├── avgCost.ts              — buy/sell/realized-P&L math (pure)
│   │   ├── avgCost.test.ts
│   │   ├── movingAverage.ts        — SMA (pure)
│   │   ├── movingAverage.test.ts
│   │   ├── csv.ts                  — export/import round-trip
│   │   ├── csv.test.ts
│   │   ├── persistStorage.ts       — navigator.storage.persist() wrapper
│   │   └── persistStorage.test.ts
│   ├── db/
│   │   ├── schema.ts               — openTradeReviewDB()
│   │   ├── tags.ts                 — Tag CRUD + archive/rename
│   │   ├── tags.test.ts
│   │   ├── trades.ts               — Trade CRUD
│   │   ├── trades.test.ts
│   │   ├── positions.ts            — derive Position from Trades
│   │   ├── positions.test.ts
│   │   ├── allTrades.ts            — list/replace every Trade (CSV backup)
│   │   └── allTrades.test.ts
│   ├── api/
│   │   ├── quotes.ts               — fetch() wrappers for /api/*
│   │   └── quotes.test.ts
│   ├── components/
│   │   ├── TagPicker.tsx / .test.tsx
│   │   ├── ConvictionStars.tsx / .test.tsx
│   │   ├── SymbolSearch.tsx / .test.tsx
│   │   ├── TradeForm.tsx / .test.tsx        — S2
│   │   ├── PriceChart.tsx / .test.tsx        — S3 차트 tab
│   │   ├── TradeBottomSheet.tsx / .test.tsx
│   │   ├── TradeList.tsx / .test.tsx         — S3 목록 tab
│   │   ├── StockDetail.tsx / .test.tsx       — S3 container
│   │   └── BackupControls.tsx / .test.tsx    — CSV export/import (12절 MVP 필수)
│   └── test/
│       └── setup.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .gitignore (existing, extended)
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/test/setup.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: an `App` component exported from `src/App.tsx` as `export function App()`, mounted by `src/main.tsx`. Later tasks replace the body of `App` (Task 19) but keep this export name/shape.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "trade-review",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "idb": "^8.0.0",
    "lightweight-charts": "^4.2.0",
    "yahoo-finance2": "^2.11.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vercel/node": "^3.2.0",
    "@vitejs/plugin-react": "^4.3.2",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.9",
    "vitest": "^2.1.3"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src", "api", "vite.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>매매 복기</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 6: Write a minimal `src/App.tsx` (replaced fully in Task 19)**

```tsx
export function App() {
  return <p>매매 복기</p>;
}
```

- [ ] **Step 7: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

- [ ] **Step 8: Extend `.gitignore` with build/dependency artifacts**

Append to the existing `.gitignore`:

```
node_modules/
dist/
.vercel/
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: lockfile created, exits 0.

- [ ] **Step 10: Verify the toolchain builds and tests run**

Run: `npm run build`
Expected: exits 0, `dist/` created.

Run: `npm test`
Expected: "No test files found" (or 0 tests) — exits 0, since no `*.test.ts` files exist yet.

- [ ] **Step 11: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src .gitignore package-lock.json
git commit -m "feat: 프로젝트 스캐폴딩 (Vite+React+TS)"
```

---

### Task 2: Domain types

**Files:**
- Create: `src/types.ts`

**Interfaces:**
- Produces: `Side`, `QuantityType`, `Currency`, `Tag`, `Trade`, `Position` — every later task imports these exact names/shapes from `../types`.

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type Side = 'buy' | 'sell';
export type QuantityType = 'shares' | 'amount';
export type Currency = 'USD' | 'KRW';

export interface Tag {
  id: string;
  name: string;
  archived: boolean;
}

export interface Trade {
  id: string;
  ticker: string;
  market: 'US' | 'KR';
  name: string;
  currency: Currency;
  /** ISO datetime string, or null when unknown/scheduled (datetimeUnknown will be true). */
  datetime: string | null;
  datetimeUnknown: boolean;
  side: Side;
  /** Fill price, in `currency`. */
  price: number;
  quantityType: QuantityType;
  /** Raw user input: share count if quantityType is 'shares', KRW amount if 'amount'. */
  quantityValue: number;
  /** Resolved share count, computed at save time via resolveQuantity(). */
  quantity: number;
  /** KRW-per-unit-of-`currency` rate at trade time. Required only when quantityType is 'amount' and currency !== 'KRW'. */
  fxRateAtTrade: number | null;
  rationaleTagIds: string[];
  conviction: number | null;
  memo: string;
  attachment: string | null;
  /** Auto-stamped when the trade is saved locally. Never shown in the UI. */
  recordedAt: string;
}

export interface Position {
  ticker: string;
  name: string;
  avgCost: number;
  totalQuantity: number;
  avgCostHistory: { at: string; avgCost: number }[];
  realizedPl: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: 도메인 타입 정의 (Trade/Tag/Position)"
```

---

### Task 3: Currency/quantity resolution (pure logic)

**Files:**
- Create: `src/lib/quantity.ts`
- Test: `src/lib/quantity.test.ts`

**Interfaces:**
- Consumes: `Currency`, `QuantityType` from `../types`.
- Produces: `resolveQuantity(input: ResolveQuantityInput): number`, used by `src/db/trades.ts` (Task 8).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/quantity.test.ts
import { describe, it, expect } from 'vitest';
import { resolveQuantity } from './quantity';

describe('resolveQuantity', () => {
  it('returns quantityValue as-is when quantityType is "shares"', () => {
    const quantity = resolveQuantity({
      quantityType: 'shares',
      quantityValue: 10,
      price: 14.97,
      tickerCurrency: 'USD',
      fxRateAtTrade: null,
    });
    expect(quantity).toBe(10);
  });

  it('divides amount by price when tickerCurrency is KRW (no FX needed)', () => {
    const quantity = resolveQuantity({
      quantityType: 'amount',
      quantityValue: 1_000_000,
      price: 50_000,
      tickerCurrency: 'KRW',
      fxRateAtTrade: null,
    });
    expect(quantity).toBe(20);
  });

  it('converts a KRW amount into shares of a non-KRW ticker using fxRateAtTrade', () => {
    const quantity = resolveQuantity({
      quantityType: 'amount',
      quantityValue: 1_250_000,
      price: 17.6,
      tickerCurrency: 'USD',
      fxRateAtTrade: 1400,
    });
    expect(quantity).toBeCloseTo(1_250_000 / (17.6 * 1400), 6);
  });

  it('throws when converting a non-KRW ticker amount without fxRateAtTrade', () => {
    expect(() =>
      resolveQuantity({
        quantityType: 'amount',
        quantityValue: 1_250_000,
        price: 17.6,
        tickerCurrency: 'USD',
        fxRateAtTrade: null,
      })
    ).toThrow(/fxRateAtTrade/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/quantity.test.ts`
Expected: FAIL — `Cannot find module './quantity'`

- [ ] **Step 3: Write `src/lib/quantity.ts`**

```ts
import type { Currency, QuantityType } from '../types';

export interface ResolveQuantityInput {
  quantityType: QuantityType;
  quantityValue: number;
  price: number;
  tickerCurrency: Currency;
  fxRateAtTrade: number | null;
}

export function resolveQuantity(input: ResolveQuantityInput): number {
  if (input.quantityType === 'shares') {
    return input.quantityValue;
  }
  if (input.tickerCurrency === 'KRW') {
    return input.quantityValue / input.price;
  }
  if (input.fxRateAtTrade == null) {
    throw new Error(
      'fxRateAtTrade is required when quantityType is "amount" and tickerCurrency is not KRW'
    );
  }
  return input.quantityValue / (input.price * input.fxRateAtTrade);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/quantity.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quantity.ts src/lib/quantity.test.ts
git commit -m "feat: 통화/수량 환산 로직 (resolveQuantity)"
```

---

### Task 4: Average cost & realized P/L (pure logic)

**Files:**
- Create: `src/lib/avgCost.ts`
- Test: `src/lib/avgCost.test.ts`

**Interfaces:**
- Produces: `PositionState`, `EMPTY_POSITION_STATE`, `applyBuy(state, price, quantity): PositionState`, `applySell(state, price, quantity): PositionState`, `buildPosition(trades): PositionState`. Used by `src/db/positions.ts` (Task 9).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/avgCost.test.ts
import { describe, it, expect } from 'vitest';
import { EMPTY_POSITION_STATE, applyBuy, applySell, buildPosition } from './avgCost';

describe('applyBuy', () => {
  it('sets avgCost to the fill price on the first buy', () => {
    const state = applyBuy(EMPTY_POSITION_STATE, 11.36, 100);
    expect(state.avgCost).toBeCloseTo(11.36, 6);
    expect(state.totalQuantity).toBe(100);
  });

  it('computes the weighted average on a second buy', () => {
    const first = applyBuy(EMPTY_POSITION_STATE, 10, 10);
    const second = applyBuy(first, 20, 10);
    expect(second.avgCost).toBeCloseTo(15, 6);
    expect(second.totalQuantity).toBe(20);
  });
});

describe('applySell', () => {
  it('does not change avgCost, only totalQuantity and realizedPl', () => {
    const bought = applyBuy(EMPTY_POSITION_STATE, 10, 10);
    const sold = applySell(bought, 15, 4);
    expect(sold.avgCost).toBeCloseTo(10, 6);
    expect(sold.totalQuantity).toBe(6);
    expect(sold.realizedPl).toBeCloseTo((15 - 10) * 4, 6);
  });

  it('accumulates realizedPl across multiple sells', () => {
    const bought = applyBuy(EMPTY_POSITION_STATE, 10, 10);
    const firstSell = applySell(bought, 15, 4);
    const secondSell = applySell(firstSell, 8, 2);
    expect(secondSell.realizedPl).toBeCloseTo((15 - 10) * 4 + (8 - 10) * 2, 6);
  });
});

describe('buildPosition', () => {
  it('naturally resets avgCost after a full sell followed by a rebuy (no special-case needed)', () => {
    const state = buildPosition([
      { side: 'buy', price: 10, quantity: 10 },
      { side: 'sell', price: 12, quantity: 10 }, // fully exits, totalQuantity -> 0
      { side: 'buy', price: 20, quantity: 5 }, // fresh position
    ]);
    expect(state.totalQuantity).toBe(5);
    expect(state.avgCost).toBeCloseTo(20, 6);
    expect(state.realizedPl).toBeCloseTo((12 - 10) * 10, 6);
  });

  it('reproduces a JOBY-like buy/sell/rebuy sequence', () => {
    const state = buildPosition([
      { side: 'buy', price: 11.36, quantity: 100 },
      { side: 'buy', price: 11.59, quantity: 50 },
      { side: 'sell', price: 17.16, quantity: 80 },
      { side: 'buy', price: 14.97, quantity: 10 },
      { side: 'buy', price: 13.77, quantity: 22 },
    ]);
    // avgCost after the two buys: (11.36*100 + 11.59*50) / 150
    // sell doesn't touch avgCost; remaining 70 @ that avgCost, then two more buys blend in
    const afterFirstTwoBuys = (11.36 * 100 + 11.59 * 50) / 150;
    const afterSell = { totalQuantity: 70, avgCost: afterFirstTwoBuys };
    const afterThirdBuy =
      (afterSell.avgCost * afterSell.totalQuantity + 14.97 * 10) / (afterSell.totalQuantity + 10);
    const afterFourthBuy =
      (afterThirdBuy * 80 + 13.77 * 22) / (80 + 22);
    expect(state.totalQuantity).toBe(102);
    expect(state.avgCost).toBeCloseTo(afterFourthBuy, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/avgCost.test.ts`
Expected: FAIL — `Cannot find module './avgCost'`

- [ ] **Step 3: Write `src/lib/avgCost.ts`**

```ts
export interface PositionState {
  totalQuantity: number;
  avgCost: number;
  realizedPl: number;
}

export const EMPTY_POSITION_STATE: PositionState = {
  totalQuantity: 0,
  avgCost: 0,
  realizedPl: 0,
};

export function applyBuy(state: PositionState, price: number, quantity: number): PositionState {
  const totalQuantity = state.totalQuantity + quantity;
  const avgCost = (state.avgCost * state.totalQuantity + price * quantity) / totalQuantity;
  return { totalQuantity, avgCost, realizedPl: state.realizedPl };
}

export function applySell(state: PositionState, price: number, quantity: number): PositionState {
  const realizedPl = state.realizedPl + (price - state.avgCost) * quantity;
  return {
    totalQuantity: state.totalQuantity - quantity,
    avgCost: state.avgCost,
    realizedPl,
  };
}

export function buildPosition(
  trades: { side: 'buy' | 'sell'; price: number; quantity: number }[]
): PositionState {
  return trades.reduce(
    (state, t) =>
      t.side === 'buy' ? applyBuy(state, t.price, t.quantity) : applySell(state, t.price, t.quantity),
    EMPTY_POSITION_STATE
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/avgCost.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/avgCost.ts src/lib/avgCost.test.ts
git commit -m "feat: 평단/실현손익 계산 로직 (ADR-0001, ADR-0002)"
```

---

### Task 5: Moving average (pure logic)

**Files:**
- Create: `src/lib/movingAverage.ts`
- Test: `src/lib/movingAverage.test.ts`

**Interfaces:**
- Produces: `simpleMovingAverage(values: number[], window: number): (number | null)[]`. Used by `src/components/PriceChart.tsx` (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/movingAverage.test.ts
import { describe, it, expect } from 'vitest';
import { simpleMovingAverage } from './movingAverage';

describe('simpleMovingAverage', () => {
  it('returns null until enough values exist for the window', () => {
    const result = simpleMovingAverage([1, 2, 3], 3);
    expect(result).toEqual([null, null, 2]);
  });

  it('computes a rolling average once the window is full', () => {
    const result = simpleMovingAverage([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([null, 1.5, 2.5, 3.5, 4.5]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/movingAverage.test.ts`
Expected: FAIL — `Cannot find module './movingAverage'`

- [ ] **Step 3: Write `src/lib/movingAverage.ts`**

```ts
export function simpleMovingAverage(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < window) return null;
    const slice = values.slice(i + 1 - window, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / window;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/movingAverage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/movingAverage.ts src/lib/movingAverage.test.ts
git commit -m "feat: 이동평균 계산 로직"
```

---

### Task 6: IndexedDB schema

**Files:**
- Create: `src/db/schema.ts`

**Interfaces:**
- Consumes: `Trade`, `Tag` from `../types`.
- Produces: `TradeReviewDB` (DBSchema type), `openTradeReviewDB(): Promise<IDBPDatabase<TradeReviewDB>>`. Used by every file in `src/db/*` and by `src/App.tsx`.

- [ ] **Step 1: Write `src/db/schema.ts`**

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Trade, Tag } from '../types';

export interface TradeReviewDB extends DBSchema {
  trades: {
    key: string;
    value: Trade;
    indexes: { 'by-ticker': string };
  };
  tags: {
    key: string;
    value: Tag;
  };
}

export function openTradeReviewDB(): Promise<IDBPDatabase<TradeReviewDB>> {
  return openDB<TradeReviewDB>('trade-review', 1, {
    upgrade(db) {
      const tradeStore = db.createObjectStore('trades', { keyPath: 'id' });
      tradeStore.createIndex('by-ticker', 'ticker');
      db.createObjectStore('tags', { keyPath: 'id' });
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: IndexedDB 스키마 (trades, tags 스토어)"
```

---

### Task 7: Tags CRUD (create, rename, archive)

**Files:**
- Create: `src/db/tags.ts`
- Test: `src/db/tags.test.ts`

**Interfaces:**
- Consumes: `openTradeReviewDB` from `./schema`; `Tag` from `../types`.
- Produces: `createTag(db, name): Promise<Tag>`, `renameTag(db, id, name): Promise<void>`, `archiveTag(db, id): Promise<void>`, `listActiveTags(db): Promise<Tag[]>`, `listAllTags(db): Promise<Tag[]>`. Used by `src/App.tsx` and `src/components/TradeForm.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/db/tags.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTag, renameTag, archiveTag, listActiveTags, listAllTags } from './tags';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
});

describe('tags', () => {
  it('creates a tag with archived: false', async () => {
    const tag = await createTag(db, '감');
    expect(tag.name).toBe('감');
    expect(tag.archived).toBe(false);
  });

  it('rename updates the tag everywhere it is stored (single source of truth)', async () => {
    const tag = await createTag(db, '감');
    await renameTag(db, tag.id, '직감');
    const all = await listAllTags(db);
    expect(all.find((t) => t.id === tag.id)?.name).toBe('직감');
  });

  it('archive hides a tag from listActiveTags but keeps it in listAllTags', async () => {
    const tag = await createTag(db, '지인추천');
    await archiveTag(db, tag.id);
    const active = await listActiveTags(db);
    const all = await listAllTags(db);
    expect(active.find((t) => t.id === tag.id)).toBeUndefined();
    expect(all.find((t) => t.id === tag.id)?.archived).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/tags.test.ts`
Expected: FAIL — `Cannot find module './tags'`

- [ ] **Step 3: Write `src/db/tags.ts`**

```ts
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Tag } from '../types';

export async function createTag(db: IDBPDatabase<TradeReviewDB>, name: string): Promise<Tag> {
  const tag: Tag = { id: crypto.randomUUID(), name, archived: false };
  await db.put('tags', tag);
  return tag;
}

export async function renameTag(db: IDBPDatabase<TradeReviewDB>, id: string, name: string): Promise<void> {
  const tag = await db.get('tags', id);
  if (!tag) throw new Error(`Tag not found: ${id}`);
  await db.put('tags', { ...tag, name });
}

export async function archiveTag(db: IDBPDatabase<TradeReviewDB>, id: string): Promise<void> {
  const tag = await db.get('tags', id);
  if (!tag) throw new Error(`Tag not found: ${id}`);
  await db.put('tags', { ...tag, archived: true });
}

export async function listActiveTags(db: IDBPDatabase<TradeReviewDB>): Promise<Tag[]> {
  const all = await db.getAll('tags');
  return all.filter((t) => !t.archived);
}

export async function listAllTags(db: IDBPDatabase<TradeReviewDB>): Promise<Tag[]> {
  return db.getAll('tags');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/tags.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/db/tags.ts src/db/tags.test.ts
git commit -m "feat: 근거 태그 CRUD (rename 소급 반영, archive는 하드삭제 아님 - ADR-0004)"
```

---

### Task 8: Trades CRUD

**Files:**
- Create: `src/db/trades.ts`
- Test: `src/db/trades.test.ts`

**Interfaces:**
- Consumes: `openTradeReviewDB` from `./schema`; `Trade` from `../types`; `resolveQuantity` from `../lib/quantity`.
- Produces: `NewTradeInput` (= `Omit<Trade, 'id' | 'recordedAt' | 'quantity'>`), `createTrade(db, input): Promise<Trade>`, `listTradesByTicker(db, ticker): Promise<Trade[]>`. Used by `src/db/positions.ts` (Task 9), `src/components/TradeForm.tsx`, `src/components/StockDetail.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/db/trades.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTrade, listTradesByTicker } from './trades';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
});

function baseInput(overrides: Partial<Parameters<typeof createTrade>[1]> = {}) {
  return {
    ticker: 'JOBY',
    market: 'US' as const,
    name: '조비',
    currency: 'USD' as const,
    datetime: '2025-07-10T00:00:00.000Z',
    datetimeUnknown: false,
    side: 'buy' as const,
    price: 11.36,
    quantityType: 'shares' as const,
    quantityValue: 100,
    fxRateAtTrade: null,
    rationaleTagIds: [],
    conviction: null,
    memo: '',
    attachment: null,
    ...overrides,
  };
}

describe('createTrade', () => {
  it('stamps id, recordedAt, and resolved quantity', async () => {
    const trade = await createTrade(db, baseInput());
    expect(trade.id).toBeTruthy();
    expect(trade.recordedAt).toBeTruthy();
    expect(trade.quantity).toBe(100);
  });

  it('resolves quantity for amount-based input using resolveQuantity', async () => {
    const trade = await createTrade(
      db,
      baseInput({ quantityType: 'amount', quantityValue: 1_250_000, price: 17.6, fxRateAtTrade: 1400 })
    );
    expect(trade.quantity).toBeCloseTo(1_250_000 / (17.6 * 1400), 6);
  });
});

describe('listTradesByTicker', () => {
  it('returns only trades for the requested ticker', async () => {
    await createTrade(db, baseInput({ ticker: 'JOBY' }));
    await createTrade(db, baseInput({ ticker: 'AAPL' }));
    const jobyTrades = await listTradesByTicker(db, 'JOBY');
    expect(jobyTrades).toHaveLength(1);
    expect(jobyTrades[0].ticker).toBe('JOBY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/trades.test.ts`
Expected: FAIL — `Cannot find module './trades'`

- [ ] **Step 3: Write `src/db/trades.ts`**

```ts
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Trade } from '../types';
import { resolveQuantity } from '../lib/quantity';

export type NewTradeInput = Omit<Trade, 'id' | 'recordedAt' | 'quantity'>;

export async function createTrade(db: IDBPDatabase<TradeReviewDB>, input: NewTradeInput): Promise<Trade> {
  const quantity = resolveQuantity({
    quantityType: input.quantityType,
    quantityValue: input.quantityValue,
    price: input.price,
    tickerCurrency: input.currency,
    fxRateAtTrade: input.fxRateAtTrade,
  });
  const trade: Trade = {
    ...input,
    id: crypto.randomUUID(),
    quantity,
    recordedAt: new Date().toISOString(),
  };
  await db.put('trades', trade);
  return trade;
}

export async function listTradesByTicker(db: IDBPDatabase<TradeReviewDB>, ticker: string): Promise<Trade[]> {
  return db.getAllFromIndex('trades', 'by-ticker', ticker);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/trades.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/db/trades.ts src/db/trades.test.ts
git commit -m "feat: Trade CRUD (recorded_at 자동 기록 - ADR-0006)"
```

---

### Task 9: Position derivation

**Files:**
- Create: `src/db/positions.ts`
- Test: `src/db/positions.test.ts`

**Interfaces:**
- Consumes: `Position`, `Trade` from `../types`; `EMPTY_POSITION_STATE`, `applyBuy`, `applySell` from `../lib/avgCost`; `listTradesByTicker` from `./trades`.
- Produces: `getPosition(db, ticker): Promise<Position>`. Used by `src/components/StockDetail.tsx` (Task 19).

- [ ] **Step 1: Write the failing test**

```ts
// src/db/positions.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTrade } from './trades';
import { getPosition } from './positions';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
});

function tradeInput(overrides: Partial<Parameters<typeof createTrade>[1]> = {}) {
  return {
    ticker: 'JOBY',
    market: 'US' as const,
    name: '조비',
    currency: 'USD' as const,
    datetime: '2025-07-10T00:00:00.000Z',
    datetimeUnknown: false,
    side: 'buy' as const,
    price: 11.36,
    quantityType: 'shares' as const,
    quantityValue: 100,
    fxRateAtTrade: null,
    rationaleTagIds: [],
    conviction: null,
    memo: '',
    attachment: null,
    ...overrides,
  };
}

describe('getPosition', () => {
  it('derives avgCost/totalQuantity/realizedPl from stored trades, ordered by datetime', async () => {
    await createTrade(db, tradeInput({ side: 'buy', price: 10, quantityValue: 10, datetime: '2025-01-01T00:00:00.000Z' }));
    await createTrade(db, tradeInput({ side: 'buy', price: 20, quantityValue: 10, datetime: '2025-01-02T00:00:00.000Z' }));
    await createTrade(db, tradeInput({ side: 'sell', price: 25, quantityValue: 5, datetime: '2025-01-03T00:00:00.000Z' }));

    const position = await getPosition(db, 'JOBY');

    expect(position.ticker).toBe('JOBY');
    expect(position.totalQuantity).toBe(15);
    expect(position.avgCost).toBeCloseTo(15, 6); // unaffected by the sell
    expect(position.realizedPl).toBeCloseTo((25 - 15) * 5, 6);
    expect(position.avgCostHistory).toHaveLength(3);
  });

  it('falls back to recordedAt ordering when datetime is null (unknown-time trades)', async () => {
    await createTrade(db, tradeInput({ datetime: null, datetimeUnknown: true, price: 10, quantityValue: 10 }));
    const position = await getPosition(db, 'JOBY');
    expect(position.totalQuantity).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/positions.test.ts`
Expected: FAIL — `Cannot find module './positions'`

- [ ] **Step 3: Write `src/db/positions.ts`**

```ts
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Position, Trade } from '../types';
import { EMPTY_POSITION_STATE, applyBuy, applySell } from '../lib/avgCost';
import { listTradesByTicker } from './trades';

function occurredAt(trade: Trade): string {
  return trade.datetime ?? trade.recordedAt;
}

function sortByOccurredAt(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => occurredAt(a).localeCompare(occurredAt(b)));
}

export async function getPosition(db: IDBPDatabase<TradeReviewDB>, ticker: string): Promise<Position> {
  const trades = sortByOccurredAt(await listTradesByTicker(db, ticker));
  let state = EMPTY_POSITION_STATE;
  const avgCostHistory: { at: string; avgCost: number }[] = [];

  for (const trade of trades) {
    state =
      trade.side === 'buy'
        ? applyBuy(state, trade.price, trade.quantity)
        : applySell(state, trade.price, trade.quantity);
    avgCostHistory.push({ at: occurredAt(trade), avgCost: state.avgCost });
  }

  return {
    ticker,
    name: trades[0]?.name ?? ticker,
    avgCost: state.avgCost,
    totalQuantity: state.totalQuantity,
    avgCostHistory,
    realizedPl: state.realizedPl,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/positions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/db/positions.ts src/db/positions.test.ts
git commit -m "feat: Trade로부터 Position 파생 (평단/실현손익/이력)"
```

---

### Task 10: CSV export/import

**Files:**
- Create: `src/lib/csv.ts`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Consumes: `Trade` from `../types`.
- Produces: `tradesToCsv(trades: Trade[]): string`, `csvToTrades(csv: string): Trade[]`. Used by `BackupControls` (Task 20) — a minimal export/import UI, not the full deferred S6 settings screen, since 12절 marks CSV backup specifically as MVP-required regardless of S6's other post-MVP settings.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/csv.test.ts
import { describe, it, expect } from 'vitest';
import { tradesToCsv, csvToTrades } from './csv';
import type { Trade } from '../types';

const sample: Trade = {
  id: 'abc-123',
  ticker: 'JOBY',
  market: 'US',
  name: '조비, 항공',
  currency: 'USD',
  datetime: '2025-07-10T00:00:00.000Z',
  datetimeUnknown: false,
  side: 'buy',
  price: 11.36,
  quantityType: 'shares',
  quantityValue: 100,
  quantity: 100,
  fxRateAtTrade: null,
  rationaleTagIds: ['tag-1', 'tag-2'],
  conviction: 4,
  memo: '관세 여파 없는 것으로 판단, "안전"하다고 봄',
  attachment: null,
  recordedAt: '2025-07-10T00:05:00.000Z',
};

describe('CSV round-trip', () => {
  it('reproduces the original trade after export then import, including commas and quotes in text fields', () => {
    const csv = tradesToCsv([sample]);
    const [restored] = csvToTrades(csv);
    expect(restored).toEqual(sample);
  });

  it('round-trips a trade with null optional fields', () => {
    const nullish: Trade = { ...sample, fxRateAtTrade: null, conviction: null, attachment: null, rationaleTagIds: [] };
    const csv = tradesToCsv([nullish]);
    const [restored] = csvToTrades(csv);
    expect(restored).toEqual(nullish);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: FAIL — `Cannot find module './csv'`

- [ ] **Step 3: Write `src/lib/csv.ts`**

```ts
import type { Trade } from '../types';

const CSV_COLUMNS = [
  'id', 'ticker', 'market', 'name', 'currency', 'datetime', 'datetimeUnknown',
  'side', 'price', 'quantityType', 'quantityValue', 'quantity', 'fxRateAtTrade',
  'rationaleTagIds', 'conviction', 'memo', 'attachment', 'recordedAt',
] as const;

type Column = (typeof CSV_COLUMNS)[number];

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function fieldToString(trade: Trade, col: Column): string {
  const raw = trade[col];
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.join(';');
  return String(raw);
}

export function tradesToCsv(trades: Trade[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = trades.map((trade) =>
    CSV_COLUMNS.map((col) => escapeCsvField(fieldToString(trade, col))).join(',')
  );
  return [header, ...rows].join('\n');
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function csvToTrades(csv: string): Trade[] {
  const lines = csv.split('\n').filter((line) => line.trim().length > 0);
  const [, ...dataLines] = lines;
  return dataLines.map((line) => {
    const fields = parseCsvLine(line);
    const record: Record<Column, string> = {} as Record<Column, string>;
    CSV_COLUMNS.forEach((col, i) => {
      record[col] = fields[i] ?? '';
    });
    return {
      id: record.id,
      ticker: record.ticker,
      market: record.market as Trade['market'],
      name: record.name,
      currency: record.currency as Trade['currency'],
      datetime: record.datetime === '' ? null : record.datetime,
      datetimeUnknown: record.datetimeUnknown === 'true',
      side: record.side as Trade['side'],
      price: Number(record.price),
      quantityType: record.quantityType as Trade['quantityType'],
      quantityValue: Number(record.quantityValue),
      quantity: Number(record.quantity),
      fxRateAtTrade: record.fxRateAtTrade === '' ? null : Number(record.fxRateAtTrade),
      rationaleTagIds: record.rationaleTagIds === '' ? [] : record.rationaleTagIds.split(';'),
      conviction: record.conviction === '' ? null : Number(record.conviction),
      memo: record.memo,
      attachment: record.attachment === '' ? null : record.attachment,
      recordedAt: record.recordedAt,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/csv.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat: CSV 내보내기/가져오기 (기획서 12절 필수 백업 기능)"
```

---

### Task 11: Persistent storage request

**Files:**
- Create: `src/lib/persistStorage.ts`
- Test: `src/lib/persistStorage.test.ts`

**Interfaces:**
- Produces: `requestPersistentStorage(): Promise<boolean>`. Called once from `src/App.tsx` (Task 19) to reduce the risk of Safari's 7-day storage eviction wiping local trade data.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/persistStorage.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPersistentStorage } from './persistStorage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestPersistentStorage', () => {
  it('calls navigator.storage.persist() and returns its result', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis.navigator, 'storage', {
      value: { persist },
      configurable: true,
    });

    const result = await requestPersistentStorage();

    expect(persist).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it('returns false when the Storage API is unavailable (no crash)', async () => {
    Object.defineProperty(globalThis.navigator, 'storage', {
      value: undefined,
      configurable: true,
    });

    const result = await requestPersistentStorage();

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/persistStorage.test.ts`
Expected: FAIL — `Cannot find module './persistStorage'`

- [ ] **Step 3: Write `src/lib/persistStorage.ts`**

```ts
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage || !navigator.storage.persist) {
    return false;
  }
  return navigator.storage.persist();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/persistStorage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/persistStorage.ts src/lib/persistStorage.test.ts
git commit -m "feat: navigator.storage.persist() 요청 (iOS 7일 삭제 정책 대응)"
```

---

### Task 12: Vercel function — symbol search

**Files:**
- Create: `api/search.ts`
- Test: `api/search.test.ts`

**Interfaces:**
- Produces: default-exported handler `(req: VercelRequest, res: VercelResponse) => Promise<void>` at `GET /api/search?q=`. Consumed by `src/api/quotes.ts` (Task 14) via `fetch('/api/search?q=...')`.

- [ ] **Step 1: Write the failing test**

```ts
// api/search.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './search';

vi.mock('yahoo-finance2', () => ({
  default: {
    search: vi.fn(),
  },
}));

import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.mocked(yahooFinance.search).mockReset();
});

describe('GET /api/search', () => {
  it('returns 400 when q is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps yahoo-finance2 search results to {symbol, name, exchange}', async () => {
    vi.mocked(yahooFinance.search).mockResolvedValue({
      quotes: [{ symbol: 'JOBY', shortname: 'Joby Aviation', exchange: 'NYQ' }],
    } as any);

    const res = mockRes();
    await handler({ query: { q: 'joby' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      symbols: [{ symbol: 'JOBY', name: 'Joby Aviation', exchange: 'NYQ' }],
    });
  });

  it('returns 502 when the upstream lookup throws', async () => {
    vi.mocked(yahooFinance.search).mockRejectedValue(new Error('upstream down'));
    const res = mockRes();
    await handler({ query: { q: 'joby' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/search.test.ts`
Expected: FAIL — `Cannot find module './search'`

- [ ] **Step 3: Write `api/search.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query.q;
  if (typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "q"' });
    return;
  }
  try {
    const result = await yahooFinance.search(query);
    const symbols = result.quotes
      .filter((q: any) => typeof q.symbol === 'string')
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname ?? q.symbol,
        exchange: q.exchange ?? '',
      }));
    res.status(200).json({ symbols });
  } catch {
    res.status(502).json({ error: 'Symbol search failed' });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/search.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add api/search.ts api/search.test.ts
git commit -m "feat: 심볼 검색 서버리스 함수 (ADR-0003, ADR-0005)"
```

---

### Task 13: Vercel functions — quote and history

**Files:**
- Create: `api/quote.ts`
- Create: `api/history.ts`
- Test: `api/quote.test.ts`
- Test: `api/history.test.ts`

**Interfaces:**
- Produces: `GET /api/quote?symbol=` → `{ symbol, price, currency }`; `GET /api/history?symbol=` → `{ bars: { date: string; close: number }[] }`. Both consumed by `src/api/quotes.ts` (Task 14).

- [ ] **Step 1: Write the failing tests**

```ts
// api/quote.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './quote';

vi.mock('yahoo-finance2', () => ({ default: { quote: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.mocked(yahooFinance.quote).mockReset();
});

describe('GET /api/quote', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns the current price and currency', async () => {
    vi.mocked(yahooFinance.quote).mockResolvedValue({
      symbol: 'JOBY',
      regularMarketPrice: 7.39,
      currency: 'USD',
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ symbol: 'JOBY', price: 7.39, currency: 'USD' });
  });

  it('returns 502 on upstream failure', async () => {
    vi.mocked(yahooFinance.quote).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

```ts
// api/history.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './history';

vi.mock('yahoo-finance2', () => ({ default: { chart: vi.fn() } }));
import yahooFinance from 'yahoo-finance2';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.mocked(yahooFinance.chart).mockReset();
});

describe('GET /api/history', () => {
  it('returns 400 when symbol is missing', async () => {
    const res = mockRes();
    await handler({ query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps chart quotes to {date, close} bars', async () => {
    vi.mocked(yahooFinance.chart).mockResolvedValue({
      quotes: [{ date: new Date('2026-07-17T00:00:00.000Z'), close: 7.39 }],
    } as any);
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.json).toHaveBeenCalledWith({ bars: [{ date: '2026-07-17', close: 7.39 }] });
  });

  it('returns 502 on upstream failure', async () => {
    vi.mocked(yahooFinance.chart).mockRejectedValue(new Error('down'));
    const res = mockRes();
    await handler({ query: { symbol: 'JOBY' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/quote.test.ts api/history.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `api/quote.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    const quote = await yahooFinance.quote(symbol);
    res.status(200).json({
      symbol: quote.symbol,
      price: quote.regularMarketPrice ?? null,
      currency: quote.currency ?? null,
    });
  } catch {
    res.status(502).json({ error: 'Quote lookup failed' });
  }
}
```

- [ ] **Step 4: Write `api/history.ts`**

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const symbol = req.query.symbol;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    res.status(400).json({ error: 'Missing query parameter "symbol"' });
    return;
  }
  try {
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 1);
    const result = await yahooFinance.chart(symbol, { period1, interval: '1d' });
    const bars = result.quotes.map((q: any) => ({
      date: (q.date as Date).toISOString().slice(0, 10),
      close: q.close,
    }));
    res.status(200).json({ bars });
  } catch {
    res.status(502).json({ error: 'History lookup failed' });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run api/quote.test.ts api/history.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 6: Commit**

```bash
git add api/quote.ts api/quote.test.ts api/history.ts api/history.test.ts
git commit -m "feat: 시세/차트 서버리스 함수 (ADR-0003, ADR-0005)"
```

---

### Task 14: Client-side API wrappers

**Files:**
- Create: `src/api/quotes.ts`
- Test: `src/api/quotes.test.ts`

**Interfaces:**
- Produces: `SymbolResult { symbol, name, exchange }`, `QuoteResult { price: number | null; currency: 'USD' | 'KRW' | null }`, `HistoryBar { date: string; close: number }`, `searchSymbols(query): Promise<SymbolResult[]>`, `fetchQuote(symbol): Promise<QuoteResult | null>`, `fetchHistory(symbol): Promise<HistoryBar[]>`. Used by `SymbolSearch`, `TradeForm`, `StockDetail` (Tasks 16, 17, 19). All three resolve to an empty/`null` fallback on any network error, so the caller falls back to manual entry (기획서 6절).

- [ ] **Step 1: Write the failing tests**

```ts
// src/api/quotes.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchSymbols, fetchQuote, fetchHistory } from './quotes';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchSymbols', () => {
  it('returns [] for an empty query without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchSymbols('  ');
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns parsed symbols on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ symbols: [{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }] }) })
    );
    const result = await searchSymbols('joby');
    expect(result).toEqual([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
  });

  it('falls back to [] on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await searchSymbols('joby');
    expect(result).toEqual([]);
  });
});

describe('fetchQuote', () => {
  it('falls back to null on network failure (manual entry fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchQuote('JOBY');
    expect(result).toBeNull();
  });
});

describe('fetchHistory', () => {
  it('falls back to [] on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await fetchHistory('JOBY');
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/quotes.test.ts`
Expected: FAIL — `Cannot find module './quotes'`

- [ ] **Step 3: Write `src/api/quotes.ts`**

```ts
export interface SymbolResult {
  symbol: string;
  name: string;
  exchange: string;
}

export interface QuoteResult {
  price: number | null;
  currency: 'USD' | 'KRW' | null;
}

export interface HistoryBar {
  date: string;
  close: number;
}

export async function searchSymbols(query: string): Promise<SymbolResult[]> {
  if (query.trim().length === 0) return [];
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.symbols;
  } catch {
    return [];
  }
}

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/quotes.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/quotes.ts src/api/quotes.test.ts
git commit -m "feat: 시세 API 클라이언트 래퍼 (실패 시 수동입력 폴백)"
```

---

### Task 15: TagPicker and ConvictionStars components

**Files:**
- Create: `src/components/TagPicker.tsx`
- Test: `src/components/TagPicker.test.tsx`
- Create: `src/components/ConvictionStars.tsx`
- Test: `src/components/ConvictionStars.test.tsx`

**Interfaces:**
- Consumes: `Tag` from `../types`.
- Produces: `<TagPicker tags selectedIds onChange />`, `<ConvictionStars value onChange />`. Both used by `TradeForm` (Task 17).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/TagPicker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagPicker } from './TagPicker';

const tags = [
  { id: '1', name: '팩트', archived: false },
  { id: '2', name: '감', archived: false },
];

describe('TagPicker', () => {
  it('toggles a tag into the selection on click', async () => {
    const onChange = vi.fn();
    render(<TagPicker tags={tags} selectedIds={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(onChange).toHaveBeenCalledWith(['1']);
  });

  it('toggles a selected tag back out of the selection', async () => {
    const onChange = vi.fn();
    render(<TagPicker tags={tags} selectedIds={['1']} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

```tsx
// src/components/ConvictionStars.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvictionStars } from './ConvictionStars';

describe('ConvictionStars', () => {
  it('reports the clicked star value', async () => {
    const onChange = vi.fn();
    render(<ConvictionStars value={null} onChange={onChange} />);
    const stars = screen.getAllByRole('radio');
    await userEvent.click(stars[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('clicking the already-selected value clears it (stays optional)', async () => {
    const onChange = vi.fn();
    render(<ConvictionStars value={3} onChange={onChange} />);
    const stars = screen.getAllByRole('radio');
    await userEvent.click(stars[2]);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/TagPicker.test.tsx src/components/ConvictionStars.test.tsx`
Expected: FAIL — modules not found. (Also add `@testing-library/user-event` to `package.json` devDependencies now: `"@testing-library/user-event": "^14.5.2"`, then `npm install`.)

- [ ] **Step 3: Write `src/components/TagPicker.tsx`**

```tsx
import type { Tag } from '../types';

interface TagPickerProps {
  tags: Tag[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function TagPicker({ tags, selectedIds, onChange }: TagPickerProps) {
  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((existing) => existing !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div role="group" aria-label="근거 태그">
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          aria-pressed={selectedIds.includes(tag.id)}
          onClick={() => toggle(tag.id)}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/ConvictionStars.tsx`**

```tsx
interface ConvictionStarsProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

export function ConvictionStars({ value, onChange }: ConvictionStarsProps) {
  return (
    <div role="radiogroup" aria-label="확신도">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(value === n ? null : n)}
        >
          {value != null && n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/TagPicker.test.tsx src/components/ConvictionStars.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/TagPicker.tsx src/components/TagPicker.test.tsx src/components/ConvictionStars.tsx src/components/ConvictionStars.test.tsx package.json package-lock.json
git commit -m "feat: 태그 선택/확신도 별점 컴포넌트 (둘 다 선택사항, 비워도 무방)"
```

---

### Task 16: SymbolSearch component

**Files:**
- Create: `src/components/SymbolSearch.tsx`
- Test: `src/components/SymbolSearch.test.tsx`

**Interfaces:**
- Consumes: `searchSymbols`, `SymbolResult` from `../api/quotes`.
- Produces: `<SymbolSearch onSelect={(result: SymbolResult) => void} />`. Used by `TradeForm` (Task 17).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/SymbolSearch.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SymbolSearch } from './SymbolSearch';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes');

describe('SymbolSearch', () => {
  it('shows search results and reports the selected symbol', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([
      { symbol: 'JOBY', name: '조비', exchange: 'NYQ' },
    ]);
    const onSelect = vi.fn();
    render(<SymbolSearch onSelect={onSelect} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    const option = await screen.findByRole('button', { name: /조비/ });
    await userEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({ symbol: 'JOBY', name: '조비', exchange: 'NYQ' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/SymbolSearch.test.tsx`
Expected: FAIL — `Cannot find module './SymbolSearch'`

- [ ] **Step 3: Write `src/components/SymbolSearch.tsx`**

```tsx
import { useState } from 'react';
import { searchSymbols, type SymbolResult } from '../api/quotes';

interface SymbolSearchProps {
  onSelect: (symbol: SymbolResult) => void;
}

export function SymbolSearch({ onSelect }: SymbolSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SymbolResult[]>([]);

  async function handleChange(next: string) {
    setQuery(next);
    setResults(await searchSymbols(next));
  }

  return (
    <div>
      <input
        aria-label="종목 검색"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="티커 또는 종목명"
      />
      <ul>
        {results.map((result) => (
          <li key={result.symbol}>
            <button type="button" onClick={() => onSelect(result)}>
              {result.name} ({result.symbol})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/SymbolSearch.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/SymbolSearch.tsx src/components/SymbolSearch.test.tsx
git commit -m "feat: 종목 검색 컴포넌트 (단일 종목 하드코딩 아님)"
```

---

### Task 17: TradeForm (S2)

**Files:**
- Create: `src/components/TradeForm.tsx`
- Test: `src/components/TradeForm.test.tsx`

**Interfaces:**
- Consumes: `TradeReviewDB` from `../db/schema`; `createTrade` from `../db/trades`; `Currency, QuantityType, Side, Tag, Trade` from `../types`; `SymbolSearch`, `TagPicker`, `ConvictionStars`; `fetchQuote`, `SymbolResult` from `../api/quotes`.
- Produces: `<TradeForm db availableTags onSaved={(trade: Trade) => void} />`. Used by `App` (Task 19).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/TradeForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTag } from '../db/tags';
import { TradeForm } from './TradeForm';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes');

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
  vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
  vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 11.36, currency: 'USD' });
});

describe('TradeForm', () => {
  it('saves a trade after selecting a symbol, a tag, and clicking save', async () => {
    const tag = await createTag(db, '팩트');
    const onSaved = vi.fn();
    render(<TradeForm db={db} availableTags={[tag]} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));

    await screen.findByDisplayValue('11.36'); // auto-filled fill price

    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '팩트' }));
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.ticker).toBe('JOBY');
    expect(saved.quantity).toBe(100);
    expect(saved.rationaleTagIds).toEqual([tag.id]);
  });

  it('allows saving with no tag, no conviction, and no memo (wellbeing: nothing is required)', async () => {
    const onSaved = vi.fn();
    render(<TradeForm db={db} availableTags={[]} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onSaved.mock.calls[0][0].rationaleTagIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/TradeForm.test.tsx`
Expected: FAIL — `Cannot find module './TradeForm'`

- [ ] **Step 3: Write `src/components/TradeForm.tsx`**

```tsx
import { useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Currency, QuantityType, Side, Tag, Trade } from '../types';
import { createTrade } from '../db/trades';
import { SymbolSearch } from './SymbolSearch';
import { TagPicker } from './TagPicker';
import { ConvictionStars } from './ConvictionStars';
import { fetchQuote, type SymbolResult } from '../api/quotes';

interface TradeFormProps {
  db: IDBPDatabase<TradeReviewDB>;
  availableTags: Tag[];
  onSaved: (trade: Trade) => void;
}

export function TradeForm({ db, availableTags, onSaved }: TradeFormProps) {
  const [symbol, setSymbol] = useState<SymbolResult | null>(null);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [side, setSide] = useState<Side>('buy');
  const [price, setPrice] = useState('');
  const [quantityType, setQuantityType] = useState<QuantityType>('shares');
  const [quantityValue, setQuantityValue] = useState('');
  const [fxRateAtTrade, setFxRateAtTrade] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [conviction, setConviction] = useState<number | null>(null);
  const [memo, setMemo] = useState('');

  async function handleSelectSymbol(result: SymbolResult) {
    setSymbol(result);
    const quote = await fetchQuote(result.symbol);
    if (quote?.price != null) {
      setPrice(String(quote.price));
    }
    if (quote?.currency) {
      setCurrency(quote.currency);
    }
  }

  async function handleSave() {
    if (!symbol) return;
    const trade = await createTrade(db, {
      ticker: symbol.symbol,
      market: currency === 'KRW' ? 'KR' : 'US',
      name: symbol.name,
      currency,
      datetime: new Date().toISOString(),
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      {!symbol && <SymbolSearch onSelect={handleSelectSymbol} />}
      {symbol && (
        <>
          <p>
            {symbol.name} ({symbol.symbol})
          </p>
          <div role="radiogroup" aria-label="매수/매도">
            <button type="button" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
              매수
            </button>
            <button type="button" aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
              매도
            </button>
          </div>
          <label>
            체결가
            <input
              aria-label="체결가"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <div role="radiogroup" aria-label="수량 단위">
            <button
              type="button"
              aria-pressed={quantityType === 'shares'}
              onClick={() => setQuantityType('shares')}
            >
              주
            </button>
            <button
              type="button"
              aria-pressed={quantityType === 'amount'}
              onClick={() => setQuantityType('amount')}
            >
              원
            </button>
          </div>
          <label>
            {quantityType === 'shares' ? '수량' : '금액(원)'}
            <input
              aria-label="수량 또는 금액"
              value={quantityValue}
              onChange={(e) => setQuantityValue(e.target.value)}
              inputMode="decimal"
            />
          </label>
          {quantityType === 'amount' && currency !== 'KRW' && (
            <label>
              체결 시점 환율
              <input
                aria-label="체결 시점 환율"
                value={fxRateAtTrade}
                onChange={(e) => setFxRateAtTrade(e.target.value)}
                inputMode="decimal"
              />
            </label>
          )}
          <TagPicker tags={availableTags} selectedIds={tagIds} onChange={setTagIds} />
          <ConvictionStars value={conviction} onChange={setConviction} />
          <label>
            메모
            <textarea aria-label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <button type="submit">저장 · 평단 자동계산</button>
        </>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/TradeForm.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/TradeForm.tsx src/components/TradeForm.test.tsx
git commit -m "feat: 매매 기록 입력 화면 S2 (근거/확신도/메모 모두 선택사항)"
```

---

### Task 18: PriceChart, TradeBottomSheet, TradeList components

**Files:**
- Create: `src/components/PriceChart.tsx`
- Test: `src/components/PriceChart.test.tsx`
- Create: `src/components/TradeBottomSheet.tsx`
- Test: `src/components/TradeBottomSheet.test.tsx`
- Create: `src/components/TradeList.tsx`
- Test: `src/components/TradeList.test.tsx`

**Interfaces:**
- Consumes: `HistoryBar` from `../api/quotes`; `Tag, Trade` from `../types`; `simpleMovingAverage` from `../lib/movingAverage`; `lightweight-charts`.
- Produces: `<PriceChart history trades avgCost onPointSelect={(trade: Trade) => void} />`, `<TradeBottomSheet trade tags onClose />`, `<TradeList trades tags onSelect={(trade: Trade) => void} />`. All three used by `StockDetail` (Task 19).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/PriceChart.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceChart } from './PriceChart';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() })),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
  LineStyle: { Dashed: 2 },
}));

describe('PriceChart', () => {
  it('renders a chart container without crashing', () => {
    render(
      <PriceChart
        history={[{ date: '2026-01-01', close: 10 }]}
        trades={[]}
        avgCost={10}
        onPointSelect={() => {}}
      />
    );
    expect(screen.getByTestId('price-chart')).toBeInTheDocument();
  });
});
```

```tsx
// src/components/TradeBottomSheet.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeBottomSheet } from './TradeBottomSheet';
import type { Trade } from '../types';

const baseTrade: Trade = {
  id: '1', ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
  datetime: '2025-10-15T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
  price: 16.3, quantityType: 'shares', quantityValue: 50, quantity: 50,
  fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
  attachment: null, recordedAt: '2025-10-15T00:05:00.000Z',
};

describe('TradeBottomSheet', () => {
  it('shows an observational fill-in nudge when there is no rationale tag, not a blaming one', () => {
    render(<TradeBottomSheet trade={baseTrade} tags={[]} onClose={() => {}} />);
    expect(screen.getByText('이 매매, 기억나는 이유가 있나요?')).toBeInTheDocument();
    expect(screen.queryByText(/왜/)).not.toBeInTheDocument();
  });

  it('shows the tag names when the trade has rationale tags', () => {
    const tags = [{ id: 't1', name: '물타기', archived: false }];
    render(
      <TradeBottomSheet trade={{ ...baseTrade, rationaleTagIds: ['t1'] }} tags={tags} onClose={() => {}} />
    );
    expect(screen.getByText('물타기')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<TradeBottomSheet trade={baseTrade} tags={[]} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

```tsx
// src/components/TradeList.test.tsx
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PriceChart.test.tsx src/components/TradeBottomSheet.test.tsx src/components/TradeList.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/components/PriceChart.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { createChart, LineStyle, type IChartApi } from 'lightweight-charts';
import type { HistoryBar } from '../api/quotes';
import type { Trade } from '../types';
import { simpleMovingAverage } from '../lib/movingAverage';

interface PriceChartProps {
  history: HistoryBar[];
  trades: Trade[];
  avgCost: number;
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

    const priceSeries = chart.addLineSeries({ color: '#2563eb' });
    priceSeries.setData(history.map((bar) => ({ time: bar.date, value: bar.close })));

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
      const series = chart.addLineSeries({ color: ma.color, lineWidth: ma.lineWidth });
      series.setData(
        simpleMovingAverage(closeValues, ma.window)
          .map((value, i) => ({ time: history[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
    }

    const avgCostSeries = chart.addLineSeries({ color: '#ea580c', lineStyle: LineStyle.Dashed });
    if (history.length > 0) {
      avgCostSeries.setData([
        { time: history[0].date, value: avgCost },
        { time: history[history.length - 1].date, value: avgCost },
      ]);
    }

    priceSeries.setMarkers(
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

- [ ] **Step 4: Write `src/components/TradeBottomSheet.tsx`**

```tsx
import type { Tag, Trade } from '../types';

interface TradeBottomSheetProps {
  trade: Trade;
  tags: Tag[];
  onClose: () => void;
}

export function TradeBottomSheet({ trade, tags, onClose }: TradeBottomSheetProps) {
  const tagNames = trade.rationaleTagIds
    .map((id) => tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <div role="dialog" aria-label="매매 상세">
      <p>
        {trade.side === 'buy' ? '매수' : '매도'} · {trade.price}
      </p>
      <p>수량: {trade.quantity}</p>
      {tagNames.length > 0 ? (
        <ul>
          {tagNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <p>이 매매, 기억나는 이유가 있나요?</p>
      )}
      {trade.memo && <p>{trade.memo}</p>}
      <button type="button" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Write `src/components/TradeList.tsx`**

```tsx
import type { Tag, Trade } from '../types';

interface TradeListProps {
  trades: Trade[];
  tags: Tag[];
  onSelect: (trade: Trade) => void;
}

export function TradeList({ trades, tags, onSelect }: TradeListProps) {
  return (
    <ul aria-label="매매 목록">
      {trades.map((trade) => {
        const tagNames = trade.rationaleTagIds
          .map((id) => tags.find((tag) => tag.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        const dateLabel = (trade.datetime ?? '날짜 모름').slice(0, 10);
        const rationaleLabel = tagNames.length > 0 ? tagNames.join(', ') : '이 매매, 기억나는 이유가 있나요?';
        return (
          <li key={trade.id}>
            <button type="button" onClick={() => onSelect(trade)}>
              {dateLabel} · {trade.side === 'buy' ? '매수' : '매도'} {trade.price} · {rationaleLabel}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/PriceChart.test.tsx src/components/TradeBottomSheet.test.tsx src/components/TradeList.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/PriceChart.tsx src/components/PriceChart.test.tsx src/components/TradeBottomSheet.tsx src/components/TradeBottomSheet.test.tsx src/components/TradeList.tsx src/components/TradeList.test.tsx
git commit -m "feat: 종목 상세 차트/목록/바텀시트 컴포넌트 (S3)"
```

---

### Task 19: StockDetail container and App shell wiring

**Files:**
- Create: `src/components/StockDetail.tsx`
- Test: `src/components/StockDetail.test.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `listTradesByTicker` from `../db/trades`; `getPosition` from `../db/positions`; `fetchHistory` from `../api/quotes`; `PriceChart`, `TradeList`, `TradeBottomSheet`.
- Produces: `<StockDetail db ticker tags />`. `App` wires `TradeForm` → `StockDetail` and requests persistent storage once on mount.

- [ ] **Step 1: Write the failing test for StockDetail**

```tsx
// src/components/StockDetail.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTrade } from '../db/trades';
import { StockDetail } from './StockDetail';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/quotes')>();
  return { ...actual, fetchHistory: vi.fn() };
});

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() })),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
  LineStyle: { Dashed: 2 },
}));

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
  vi.mocked(quotes.fetchHistory).mockResolvedValue([{ date: '2025-07-10', close: 11.36 }]);
});

describe('StockDetail', () => {
  it('switches between 차트 and 목록 tabs', async () => {
    await createTrade(db, {
      ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 11.36, quantityType: 'shares', quantityValue: 100,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });

    render(<StockDetail db={db} ticker="JOBY" tags={[]} />);

    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(await screen.findByRole('list', { name: '매매 목록' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/StockDetail.test.tsx`
Expected: FAIL — `Cannot find module './StockDetail'`

- [ ] **Step 3: Write `src/components/StockDetail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Position, Tag, Trade } from '../types';
import { listTradesByTicker } from '../db/trades';
import { getPosition } from '../db/positions';
import { fetchHistory, type HistoryBar } from '../api/quotes';
import { PriceChart } from './PriceChart';
import { TradeList } from './TradeList';
import { TradeBottomSheet } from './TradeBottomSheet';

interface StockDetailProps {
  db: IDBPDatabase<TradeReviewDB>;
  ticker: string;
  tags: Tag[];
}

export function StockDetail({ db, ticker, tags }: StockDetailProps) {
  const [tab, setTab] = useState<'chart' | 'list'>('chart');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [position, setPosition] = useState<Position | null>(null);
  const [history, setHistory] = useState<HistoryBar[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);

  useEffect(() => {
    listTradesByTicker(db, ticker).then(setTrades);
    getPosition(db, ticker).then(setPosition);
    fetchHistory(ticker).then(setHistory);
  }, [db, ticker]);

  return (
    <div>
      <div role="tablist" aria-label="종목 상세 탭">
        <button type="button" role="tab" aria-selected={tab === 'chart'} onClick={() => setTab('chart')}>
          차트
        </button>
        <button type="button" role="tab" aria-selected={tab === 'list'} onClick={() => setTab('list')}>
          목록
        </button>
      </div>
      {tab === 'chart' && position && (
        <PriceChart history={history} trades={trades} avgCost={position.avgCost} onPointSelect={setSelected} />
      )}
      {tab === 'list' && <TradeList trades={trades} tags={tags} onSelect={setSelected} />}
      {selected && <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/StockDetail.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Write the failing test for App**

```tsx
// src/App.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import * as quotes from '../src/api/quotes';

vi.mock('./api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/quotes')>();
  return {
    ...actual,
    searchSymbols: vi.fn().mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]),
    fetchQuote: vi.fn().mockResolvedValue({ price: 11.36, currency: 'USD' }),
    fetchHistory: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() })),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
  LineStyle: { Dashed: 2 },
}));

beforeEach(() => {
  indexedDB.deleteDatabase('trade-review');
});

describe('App', () => {
  it('goes from the trade form to the stock detail screen after saving', async () => {
    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(await screen.findByRole('tablist', { name: '종목 상세 탭' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — current `App` only renders `<p>매매 복기</p>`, no form/tablist appears.

- [ ] **Step 7: Write the full `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './db/schema';
import { listActiveTags } from './db/tags';
import { requestPersistentStorage } from './lib/persistStorage';
import { TradeForm } from './components/TradeForm';
import { StockDetail } from './components/StockDetail';
import type { Tag, Trade } from './types';

export function App() {
  const [db, setDb] = useState<IDBPDatabase<TradeReviewDB> | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [screen, setScreen] = useState<'form' | 'detail'>('form');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);

  useEffect(() => {
    requestPersistentStorage();
    openTradeReviewDB().then(async (opened) => {
      setDb(opened);
      setTags(await listActiveTags(opened));
    });
  }, []);

  function handleSaved(trade: Trade) {
    setActiveTicker(trade.ticker);
    setScreen('detail');
  }

  if (!db) return <p>불러오는 중...</p>;

  return (
    <main>
      {screen === 'form' && <TradeForm db={db} availableTags={tags} onSaved={handleSaved} />}
      {screen === 'detail' && activeTicker && (
        <>
          <button type="button" onClick={() => setScreen('form')}>
            + 매매 기록 추가
          </button>
          <StockDetail db={db} ticker={activeTicker} tags={tags} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all test files PASS.

- [ ] **Step 10: Verify the production build still works**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 11: Commit**

```bash
git add src/components/StockDetail.tsx src/components/StockDetail.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: S2→S3 화면 연결 및 앱 셸 (persist storage 요청 포함)"
```

---

### Task 20: CSV export/import UI

12절 explicitly requires CSV export/import as an MVP-required backup feature ("MVP 필수 기능"), separate from the rest of the deferred S6 설정 screen (currency source, quote-source settings, etc., which remain out of scope per Task list above). This task exposes only the export/import actions themselves — not a full settings screen — using the `tradesToCsv`/`csvToTrades` library from Task 10.

**Files:**
- Create: `src/db/allTrades.ts`
- Test: `src/db/allTrades.test.ts`
- Create: `src/components/BackupControls.tsx`
- Test: `src/components/BackupControls.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `tradesToCsv`, `csvToTrades` from `../lib/csv`; `Trade` from `../types`.
- Produces: `listAllTrades(db): Promise<Trade[]>` (in `src/db/allTrades.ts`); `<BackupControls db onImported={() => void} />`. Wired into `App.tsx`.

- [ ] **Step 1: Write the failing test for `listAllTrades`**

```ts
// src/db/allTrades.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTrade } from './trades';
import { listAllTrades } from './allTrades';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
});

describe('listAllTrades', () => {
  it('returns every trade across every ticker', async () => {
    await createTrade(db, {
      ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 11.36, quantityType: 'shares', quantityValue: 100,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });
    await createTrade(db, {
      ticker: 'AAPL', market: 'US', name: 'Apple', currency: 'USD',
      datetime: '2025-07-11T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 200, quantityType: 'shares', quantityValue: 1,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });
    const all = await listAllTrades(db);
    expect(all).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/allTrades.test.ts`
Expected: FAIL — `Cannot find module './allTrades'`

- [ ] **Step 3: Write `src/db/allTrades.ts`**

```ts
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Trade } from '../types';

export async function listAllTrades(db: IDBPDatabase<TradeReviewDB>): Promise<Trade[]> {
  return db.getAll('trades');
}

export async function putAllTrades(db: IDBPDatabase<TradeReviewDB>, trades: Trade[]): Promise<void> {
  const tx = db.transaction('trades', 'readwrite');
  await Promise.all(trades.map((trade) => tx.store.put(trade)));
  await tx.done;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/allTrades.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write the failing test for `BackupControls`**

```tsx
// src/components/BackupControls.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTrade } from '../db/trades';
import { listAllTrades } from '../db/allTrades';
import { BackupControls } from './BackupControls';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  indexedDB.deleteDatabase('trade-review');
  db = await openTradeReviewDB();
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  URL.revokeObjectURL = vi.fn();
});

describe('BackupControls', () => {
  it('exports every stored trade as a downloadable CSV', async () => {
    await createTrade(db, {
      ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 11.36, quantityType: 'shares', quantityValue: 100,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });
    render(<BackupControls db={db} onImported={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '내보내기 (CSV)' }));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('imports a CSV file and calls onImported', async () => {
    const onImported = vi.fn();
    render(<BackupControls db={db} onImported={onImported} />);

    const csv =
      'id,ticker,market,name,currency,datetime,datetimeUnknown,side,price,quantityType,quantityValue,quantity,fxRateAtTrade,rationaleTagIds,conviction,memo,attachment,recordedAt\n' +
      'x1,JOBY,US,조비,USD,2025-07-10T00:00:00.000Z,false,buy,11.36,shares,100,100,,,,,,2025-07-10T00:05:00.000Z';
    const file = new File([csv], 'trades.csv', { type: 'text/csv' });

    await userEvent.upload(screen.getByLabelText('CSV 가져오기'), file);

    expect(onImported).toHaveBeenCalledOnce();
    const restored = await listAllTrades(db);
    expect(restored).toHaveLength(1);
    expect(restored[0].ticker).toBe('JOBY');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/components/BackupControls.test.tsx`
Expected: FAIL — `Cannot find module './BackupControls'`

- [ ] **Step 7: Write `src/components/BackupControls.tsx`**

```tsx
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import { listAllTrades, putAllTrades } from '../db/allTrades';
import { tradesToCsv, csvToTrades } from '../lib/csv';

interface BackupControlsProps {
  db: IDBPDatabase<TradeReviewDB>;
  onImported: () => void;
}

export function BackupControls({ db, onImported }: BackupControlsProps) {
  async function handleExport() {
    const trades = await listAllTrades(db);
    const csv = tradesToCsv(trades);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'trade-review-backup.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const trades = csvToTrades(text);
    await putAllTrades(db, trades);
    onImported();
  }

  return (
    <div>
      <button type="button" onClick={handleExport}>
        내보내기 (CSV)
      </button>
      <label>
        CSV 가져오기
        <input type="file" accept=".csv" aria-label="CSV 가져오기" onChange={handleImport} />
      </label>
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/components/BackupControls.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Wire `BackupControls` into `App.tsx`**

Add the import and render it in the `detail` screen branch of `src/App.tsx`:

```tsx
import { BackupControls } from './components/BackupControls';
```

```tsx
      {screen === 'detail' && activeTicker && (
        <>
          <button type="button" onClick={() => setScreen('form')}>
            + 매매 기록 추가
          </button>
          <BackupControls db={db} onImported={() => window.location.reload()} />
          <StockDetail db={db} ticker={activeTicker} tags={tags} />
        </>
      )}
```

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: all test files PASS.

- [ ] **Step 11: Commit**

```bash
git add src/db/allTrades.ts src/db/allTrades.test.ts src/components/BackupControls.tsx src/components/BackupControls.test.tsx src/App.tsx
git commit -m "feat: CSV 내보내기/가져오기 UI 연결 (12절 MVP 필수 백업 기능)"
```

---

### Task 21: Trade datetime input (past dates + "시간 모름/예약매매")

The final whole-branch review (after Task 20) found that `TradeForm` (Task 17) hardcodes `datetime: new Date().toISOString()` on every save, with no way to enter a past trade date or mark it unknown/scheduled — even though `Trade`, `Position`, and the CSV layer already fully support `datetime: string | null` + `datetimeUnknown`. This directly affects the app's core "복기" value: entering a historical trade would misplace its chart marker on today's date instead of when it actually happened. This task closes that gap.

**Files:**
- Modify: `src/components/TradeForm.tsx`
- Modify: `src/components/TradeForm.test.tsx`

**Interfaces:**
- No new exports — this only changes `TradeForm`'s internal state and the `datetime`/`datetimeUnknown` fields passed to `createTrade` (Task 8), which already accepts both.

- [ ] **Step 1: Write the two new failing tests, added to the existing `describe('TradeForm', ...)` block**

```tsx
// Add to src/components/TradeForm.test.tsx, inside the existing describe('TradeForm', ...) block
it('saves the selected past date as the trade datetime', async () => {
  const onSaved = vi.fn();
  render(<TradeForm db={db} availableTags={[]} onSaved={onSaved} />);

  await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
  await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
  await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');

  const dateInput = screen.getByLabelText('체결 날짜');
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, '2025-07-10');

  await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

  expect(onSaved).toHaveBeenCalledOnce();
  const saved = onSaved.mock.calls[0][0];
  expect(saved.datetime).toBe(new Date('2025-07-10').toISOString());
  expect(saved.datetimeUnknown).toBe(false);
});

it('saves datetime as null and datetimeUnknown as true when "시간 모름/예약매매" is toggled on', async () => {
  const onSaved = vi.fn();
  render(<TradeForm db={db} availableTags={[]} onSaved={onSaved} />);

  await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
  await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
  await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');

  await userEvent.click(screen.getByRole('button', { name: '시간 모름 / 예약매매' }));
  await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

  expect(onSaved).toHaveBeenCalledOnce();
  const saved = onSaved.mock.calls[0][0];
  expect(saved.datetime).toBeNull();
  expect(saved.datetimeUnknown).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/components/TradeForm.test.tsx`
Expected: FAIL — `getByLabelText('체결 날짜')` and the "시간 모름 / 예약매매" button don't exist yet; the two new tests fail, the four pre-existing tests still pass.

- [ ] **Step 3: Add datetime state to `TradeForm.tsx`**

Add these two lines of state alongside the existing `useState` calls (after the `memo` state):

```tsx
const [datetimeValue, setDatetimeValue] = useState(() => new Date().toISOString().slice(0, 10));
const [datetimeUnknown, setDatetimeUnknown] = useState(false);
```

- [ ] **Step 4: Replace the hardcoded datetime fields in `handleSave`**

Find this in `handleSave`'s `createTrade` call:

```tsx
      datetime: new Date().toISOString(),
      datetimeUnknown: false,
```

Replace with:

```tsx
      datetime: datetimeUnknown ? null : new Date(datetimeValue).toISOString(),
      datetimeUnknown,
```

- [ ] **Step 5: Add the date input and the unknown-time toggle to the JSX**

Insert this right after the 체결가 `<label>` block (before the 수량 단위 `<div role="radiogroup">`):

```tsx
          <label>
            체결 날짜
            <input
              aria-label="체결 날짜"
              type="date"
              value={datetimeValue}
              onChange={(e) => setDatetimeValue(e.target.value)}
              disabled={datetimeUnknown}
            />
          </label>
          <button
            type="button"
            aria-pressed={datetimeUnknown}
            onClick={() => setDatetimeUnknown((prev) => !prev)}
          >
            시간 모름 / 예약매매
          </button>
```

- [ ] **Step 6: Run tests to verify all 6 pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npx vitest run src/components/TradeForm.test.tsx`
Expected: PASS (6 tests — the original 4 plus these 2 new ones)

- [ ] **Step 7: Run the full suite and build**

Run: `npm test` — expect all tests passing (58+ total).
Run: `npm run build` — expect exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/components/TradeForm.tsx src/components/TradeForm.test.tsx
git commit -m "feat: 매매 기록에 체결 날짜 입력 및 시간 모름/예약매매 토글 추가 (최종 리뷰 Important #1 반영)"
```

---

## Manual Verification (not automated — do after Task 21)

- [ ] `npm run dev`, open on a real phone (or Chrome DevTools device toolbar) and confirm the trade-entry-to-tag-save flow feels like "a couple of taps," per the 기획서 S2 success criterion.
- [ ] Deploy to Vercel (`vercel --prod` or push to the connected GitHub repo) and confirm `/api/search`, `/api/quote`, `/api/history` respond correctly in production, not just via mocks.
- [ ] On an iPhone, add the deployed URL to the Home Screen and confirm the app opens as a standalone window (no Safari chrome) — this is the mitigation for the 7-day storage eviction risk discussed with the user.
- [ ] Manually enter a few of the real JOBY seed-data trades (기획서 10절) end-to-end through the S2 form and confirm the computed `avgCost` in S3 matches hand-calculation, without ever committing that real trade data into the repository (per the earlier discussion — real trade data stays local, keep it out of any fixture files or seed scripts checked into git).
