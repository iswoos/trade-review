# 차트 우선 진입 플로우 + 대시보드 리디자인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매매 기록 입력을 경유해야만 차트를 볼 수 있던 지금의 플로우를, 종목을 고르면 바로 차트로 가고 매매 입력은 그 안에서 필요할 때 여는 바텀시트로 옮기는 구조로 바꾼다. 동시에 스타일 없는 시맨틱 HTML을 Tailwind 기반 카드형 디자인(다크모드 포함)으로 바꾼다.

**Architecture:** `App.tsx`의 화면 상태를 `'form' | 'detail'`에서 `'home' | 'chart'`로 교체한다. 홈 화면(신규)은 상단 통합 검색창 + 하단 정렬 가능한 보유 포지션 목록. 차트 화면(`StockDetail` → `ChartScreen`으로 대체)은 상단 검색창 상시 노출 + 좌우 화살표(포지션 순회) + 차트(포지션 유무 무관하게 항상 렌더링) + 하단 액션 2종("매매 기록 추가"/"매매 목록", 둘 다 바텀시트).

**Tech Stack:** React 18 + Vite (기존) + Tailwind CSS v4(신규, `@tailwindcss/vite`) + idb + lightweight-charts + Vitest/Testing Library(기존).

## Global Constraints

- Node >=20 필요 (기존 `package.json`의 `engines` 필드).
- Tailwind CSS v4는 `@tailwindcss/vite` 플러그인으로 설치한다. PostCSS 설정 파일은 만들지 않는다.
- 다크모드는 Tailwind 기본 `dark:` variant(= `prefers-color-scheme` 미디어 쿼리 기반)를 쓴다. 이번 스코프에는 수동 토글이 없다.
- 색 토큰은 `src/index.css`의 `@theme` 블록 한 곳에서만 정의한다: `--color-accent: #10b981`(Emerald, 브랜드/수익), `--color-loss: #dc2626`(손실 — 장식용 액센트가 아니라 기능색이라 "액센트 1개" 규칙의 예외로 취급). 배경/표면은 Tailwind 기본 팔레트의 `zinc-50`/`white`(라이트), `zinc-900`/`zinc-950`(다크)를 쓰고 순수 `#000`/`#fff`는 쓰지 않는다.
- Shape Consistency Lock: 카드·바텀시트는 `rounded-2xl`(16px), 그 안의 버튼·입력·필 형태 컨트롤은 `rounded-xl` 또는 `rounded-full`. Task 10에서 이 규칙을 전체에 일관 적용한다.
- 이번 작업은 IndexedDB 스키마/버전을 바꾸지 않는다. 신규 읽기 경로(`listPositions`)는 기존 `trades` 오브젝트 스토어와 `by-ticker` 인덱스만 사용한다.
- 기존 한글 `aria-label`/버튼 텍스트는 테스트 계약이다. Task 10(스타일링)은 어떤 텍스트·aria-label·role도 바꾸지 않고 className만 추가한다.
- TDD: 로직이 있는 태스크(2~9)는 실패하는 테스트를 먼저 작성한다. Task 1(툴링)과 Task 10(스타일링 전용)은 red/green으로 검증할 로직이 없으므로 대신 전체 테스트 스위트 통과 + 빌드 성공으로 검증한다.
- 태스크당 커밋 1개(이 프로젝트의 기존 관례).

---

### Task 1: Tailwind CSS v4 도입

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/index.css`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `--color-accent`, `--color-loss` Tailwind 테마 토큰(이후 태스크의 `bg-accent`, `text-accent`, `bg-loss`, `text-loss` 등 유틸리티가 이걸 근거로 동작).

- [ ] **Step 1: Tailwind 의존성 설치**

Run: `npm install -D tailwindcss @tailwindcss/vite`

- [ ] **Step 2: Vite 설정에 Tailwind 플러그인 추가**

`vite.config.ts` 전체 내용:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 3: 전역 CSS + 테마 토�큰 생성**

`src/index.css` (신규 파일):

```css
@import 'tailwindcss';

@theme {
  --color-accent: #10b981;
  --color-loss: #dc2626;
}
```

- [ ] **Step 4: main.tsx에서 전역 CSS 임포트**

`src/main.tsx` 전체 내용:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 5: 빌드로 검증**

Run: `npm run build`
Expected: 에러 없이 성공 (아직 어떤 컴포넌트도 Tailwind 클래스를 쓰지 않으므로 동작 변화는 없음 — 이 단계는 툴체인 연결만 확인).

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json vite.config.ts src/index.css src/main.tsx
git commit -m "chore: Tailwind CSS v4 도입 (다크모드 대응 색 토큰 정의)"
```

---

### Task 2: 전체 포지션 목록 조회 (`listPositions`)

**Files:**
- Modify: `src/db/positions.ts`
- Modify: `src/db/positions.test.ts`

**Interfaces:**
- Consumes: `listAllTrades(db)` (`src/db/allTrades.ts`, 이미 존재), `getPosition(db, ticker)` (같은 파일에 이미 존재).
- Produces: `listPositions(db: IDBPDatabase<TradeReviewDB>): Promise<Position[]>` — 이후 Task 9(App.tsx)가 홈 화면 데이터 소스로 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/db/positions.test.ts` 맨 위 import에 `listPositions` 추가, 맨 아래에 새 `describe` 블록 추가:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './schema';
import { createTrade } from './trades';
import { getPosition, listPositions } from './positions';

// ... (기존 beforeEach/afterEach/tradeInput/getPosition describe는 그대로 둔다) ...

describe('listPositions', () => {
  it('returns one Position per distinct ticker across all stored trades', async () => {
    await createTrade(
      db,
      tradeInput({ ticker: 'JOBY', name: '조비', price: 10, quantityValue: 10, datetime: '2025-01-01T00:00:00.000Z' })
    );
    await createTrade(
      db,
      tradeInput({ ticker: 'AAPL', name: 'Apple Inc.', price: 100, quantityValue: 5, datetime: '2025-01-02T00:00:00.000Z' })
    );

    const positions = await listPositions(db);

    expect(positions.map((p) => p.ticker).sort()).toEqual(['AAPL', 'JOBY']);
    const aapl = positions.find((p) => p.ticker === 'AAPL');
    expect(aapl?.avgCost).toBeCloseTo(100, 6);
  });

  it('returns an empty array when there are no trades at all', async () => {
    expect(await listPositions(db)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- positions.test.ts`
Expected: FAIL — `listPositions` is not exported from './positions'.

- [ ] **Step 3: 구현**

`src/db/positions.ts`에 추가(파일 맨 위 import에 `listAllTrades` 추가, 맨 아래에 함수 추가):

```ts
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from './schema';
import type { Position, Trade } from '../types';
import { EMPTY_POSITION_STATE, applyBuy, applySell } from '../lib/avgCost';
import { listTradesByTicker } from './trades';
import { listAllTrades } from './allTrades';

// ... occurredAt / sortByOccurredAt / getPosition은 그대로 ...

export async function listPositions(db: IDBPDatabase<TradeReviewDB>): Promise<Position[]> {
  const trades = await listAllTrades(db);
  const tickers = [...new Set(trades.map((trade) => trade.ticker))];
  return Promise.all(tickers.map((ticker) => getPosition(db, ticker)));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- positions.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/db/positions.ts src/db/positions.test.ts
git commit -m "feat: 전체 보유 포지션 목록 조회 함수(listPositions) 추가"
```

---

### Task 3: 포지션 정렬 + 좌우 네비게이션 순수 함수

**Files:**
- Create: `src/lib/positionNav.ts`
- Create: `src/lib/positionNav.test.ts`

**Interfaces:**
- Produces:
  - `interface PositionListItem { ticker: string; name: string; avgCost: number; lastTradeAt: string; currentPrice: number | null }`
  - `type SortOrder = 'recent' | 'alphabetical' | 'pnl'`
  - `sortPositionItems(items: PositionListItem[], order: SortOrder): PositionListItem[]`
  - `adjacentTicker(sortedTickers: string[], currentTicker: string, direction: 'prev' | 'next'): string | null`
- 이후 Task 5(TickerSearch), 7(HomeScreen), 8(ChartScreen), 9(App)가 이 타입/함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/positionNav.test.ts` (신규):

```ts
import { describe, it, expect } from 'vitest';
import { sortPositionItems, adjacentTicker, type PositionListItem } from './positionNav';

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    avgCost: 100,
    lastTradeAt: '2025-01-01T00:00:00.000Z',
    currentPrice: 110,
    ...overrides,
  };
}

describe('sortPositionItems', () => {
  it('sorts by most recent trade first for "recent"', () => {
    const items = [
      item({ ticker: 'A', lastTradeAt: '2025-01-01T00:00:00.000Z' }),
      item({ ticker: 'B', lastTradeAt: '2025-03-01T00:00:00.000Z' }),
    ];
    expect(sortPositionItems(items, 'recent').map((i) => i.ticker)).toEqual(['B', 'A']);
  });

  it('sorts alphabetically by ticker for "alphabetical"', () => {
    const items = [item({ ticker: 'JOBY' }), item({ ticker: 'AAPL' })];
    expect(sortPositionItems(items, 'alphabetical').map((i) => i.ticker)).toEqual(['AAPL', 'JOBY']);
  });

  it('sorts by unrealized P&L percent, highest first, for "pnl"', () => {
    const items = [
      item({ ticker: 'LOSER', avgCost: 100, currentPrice: 50 }),
      item({ ticker: 'WINNER', avgCost: 100, currentPrice: 150 }),
    ];
    expect(sortPositionItems(items, 'pnl').map((i) => i.ticker)).toEqual(['WINNER', 'LOSER']);
  });

  it('treats a missing current price as lowest priority for "pnl"', () => {
    const items = [item({ ticker: 'UNKNOWN', currentPrice: null }), item({ ticker: 'KNOWN', avgCost: 100, currentPrice: 120 })];
    expect(sortPositionItems(items, 'pnl').map((i) => i.ticker)).toEqual(['KNOWN', 'UNKNOWN']);
  });

  it('does not mutate the input array', () => {
    const items = [item({ ticker: 'B' }), item({ ticker: 'A' })];
    sortPositionItems(items, 'alphabetical');
    expect(items.map((i) => i.ticker)).toEqual(['B', 'A']);
  });
});

describe('adjacentTicker', () => {
  const order = ['AAPL', 'JOBY', 'TSLA'];

  it('returns the previous ticker', () => {
    expect(adjacentTicker(order, 'JOBY', 'prev')).toBe('AAPL');
  });

  it('returns the next ticker', () => {
    expect(adjacentTicker(order, 'JOBY', 'next')).toBe('TSLA');
  });

  it('returns null when already at the start going prev', () => {
    expect(adjacentTicker(order, 'AAPL', 'prev')).toBeNull();
  });

  it('returns null when already at the end going next', () => {
    expect(adjacentTicker(order, 'TSLA', 'next')).toBeNull();
  });

  it('returns null when the current ticker is not in the list', () => {
    expect(adjacentTicker(order, 'GME', 'next')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- positionNav.test.ts`
Expected: FAIL — `./positionNav` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/lib/positionNav.ts` (신규):

```ts
export interface PositionListItem {
  ticker: string;
  name: string;
  avgCost: number;
  lastTradeAt: string;
  currentPrice: number | null;
}

export type SortOrder = 'recent' | 'alphabetical' | 'pnl';

function pnlPercent(item: PositionListItem): number {
  if (item.currentPrice == null || item.avgCost === 0) return -Infinity;
  return ((item.currentPrice - item.avgCost) / item.avgCost) * 100;
}

export function sortPositionItems(items: PositionListItem[], order: SortOrder): PositionListItem[] {
  const copy = [...items];
  if (order === 'recent') {
    return copy.sort((a, b) => b.lastTradeAt.localeCompare(a.lastTradeAt));
  }
  if (order === 'alphabetical') {
    return copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }
  return copy.sort((a, b) => pnlPercent(b) - pnlPercent(a));
}

export function adjacentTicker(
  sortedTickers: string[],
  currentTicker: string,
  direction: 'prev' | 'next'
): string | null {
  const index = sortedTickers.indexOf(currentTicker);
  if (index === -1) return null;
  const nextIndex = direction === 'prev' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= sortedTickers.length) return null;
  return sortedTickers[nextIndex];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- positionNav.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/positionNav.ts src/lib/positionNav.test.ts
git commit -m "feat: 포지션 정렬 + 좌우 네비게이션 순수 함수(positionNav) 추가"
```

---

### Task 4: `PriceChart`의 `avgCost`를 옵셔널로 변경 (포지션 없어도 차트 렌더링)

**Files:**
- Modify: `src/components/PriceChart.tsx`
- Modify: `src/components/PriceChart.test.tsx`

**Interfaces:**
- Consumes: 없음(기존 props 변경만).
- Produces: `PriceChartProps.avgCost: number | null` (기존 `number`에서 변경) — Task 8(ChartScreen)이 포지션 없는 종목에 `null`을 넘긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/PriceChart.test.tsx`에 `createChart` import와 새 테스트 추가:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createChart } from 'lightweight-charts';
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
      <PriceChart history={[{ date: '2026-01-01', close: 10 }]} trades={[]} avgCost={10} onPointSelect={() => {}} />
    );
    expect(screen.getByTestId('price-chart')).toBeInTheDocument();
  });

  it('skips the avg-cost line entirely when avgCost is null (no position yet)', () => {
    const addLineSeriesSpy = vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addLineSeries: addLineSeriesSpy,
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as ReturnType<typeof createChart>);

    render(
      <PriceChart history={[{ date: '2026-01-01', close: 10 }]} trades={[]} avgCost={null} onPointSelect={() => {}} />
    );

    // price series(1) + 5 moving averages = 6 calls; no 7th call for the avg-cost line.
    expect(addLineSeriesSpy).toHaveBeenCalledTimes(6);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- PriceChart.test.tsx`
Expected: FAIL — 지금은 `avgCost` 값과 무관하게 항상 `addLineSeries`가 7번 호출됨.

- [ ] **Step 3: 구현**

`src/components/PriceChart.tsx` 전체 내용:

```tsx
import { useEffect, useRef } from 'react';
import { createChart, LineStyle, type IChartApi } from 'lightweight-charts';
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

    if (avgCost != null && history.length > 0) {
      const avgCostSeries = chart.addLineSeries({ color: '#ea580c', lineStyle: LineStyle.Dashed });
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- PriceChart.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/PriceChart.tsx src/components/PriceChart.test.tsx
git commit -m "feat: PriceChart가 포지션 없는 종목(avgCost=null)도 렌더링하도록 변경"
```

---

### Task 5: 통합 검색 컴포넌트 (`TickerSearch`)

**Files:**
- Create: `src/components/TickerSearch.tsx`
- Create: `src/components/TickerSearch.test.tsx`

**Interfaces:**
- Consumes: `searchSymbols(query)` (`src/api/quotes.ts`, 기존), `PositionListItem` (Task 3).
- Produces: `<TickerSearch positions={PositionListItem[]} onSelectTicker={(ticker, name) => void} />` — Task 7(HomeScreen), 8(ChartScreen)이 그대로 재사용(홈/차트 화면 공용).
- 이 컴포넌트는 기존 `SymbolSearch`를 대체한다. `SymbolSearch.tsx`/`SymbolSearch.test.tsx`는 아직 `TradeForm`이 쓰고 있으므로 Task 9에서 함께 삭제한다(지금 지우면 안 됨).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/TickerSearch.test.tsx` (신규):

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TickerSearch } from './TickerSearch';
import * as quotes from '../api/quotes';

vi.mock('../api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/quotes')>();
  return { ...actual, searchSymbols: vi.fn() };
});

afterEach(() => cleanup());

describe('TickerSearch', () => {
  it('groups matching held positions separately from new API search results', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY2', name: 'Joby Clone', exchange: 'NYQ' }]);

    render(
      <TickerSearch
        positions={[
          { ticker: 'JOBY', name: '조비', avgCost: 10, lastTradeAt: '2025-01-01T00:00:00.000Z', currentPrice: 11 },
        ]}
        onSelectTicker={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');

    expect(await screen.findByRole('list', { name: '내 포지션 검색 결과' })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: '신규 검색 결과' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /조비 \(JOBY\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Joby Clone \(JOBY2\)/ })).toBeInTheDocument();
  });

  it('calls onSelectTicker with the ticker and name when a result is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSelectTicker = vi.fn();

    render(
      <TickerSearch
        positions={[
          { ticker: 'AAPL', name: 'Apple Inc.', avgCost: 100, lastTradeAt: '2025-01-01T00:00:00.000Z', currentPrice: 110 },
        ]}
        onSelectTicker={onSelectTicker}
      />
    );

    await userEvent.type(screen.getByLabelText('종목 검색'), 'apple');
    await userEvent.click(await screen.findByRole('button', { name: /Apple Inc\. \(AAPL\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('shows no result lists when the query is empty', () => {
    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);
    expect(screen.queryByRole('list', { name: '내 포지션 검색 결과' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '신규 검색 결과' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- TickerSearch.test.tsx`
Expected: FAIL — `./TickerSearch` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/components/TickerSearch.tsx` (신규):

```tsx
import { useState } from 'react';
import { searchSymbols, type SymbolResult } from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

interface TickerSearchProps {
  positions: PositionListItem[];
  onSelectTicker: (ticker: string, name: string) => void;
}

export function TickerSearch({ positions, onSelectTicker }: TickerSearchProps) {
  const [query, setQuery] = useState('');
  const [apiResults, setApiResults] = useState<SymbolResult[]>([]);

  async function handleChange(next: string) {
    setQuery(next);
    setApiResults(next.trim() ? await searchSymbols(next) : []);
  }

  const trimmed = query.trim().toLowerCase();
  const matchedPositions = trimmed
    ? positions.filter((p) => p.ticker.toLowerCase().includes(trimmed) || p.name.toLowerCase().includes(trimmed))
    : [];

  return (
    <div>
      <input
        aria-label="종목 검색"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="종목명 또는 티커 검색"
      />
      {trimmed && (
        <>
          {matchedPositions.length > 0 && (
            <ul aria-label="내 포지션 검색 결과">
              {matchedPositions.map((p) => (
                <li key={p.ticker}>
                  <button type="button" onClick={() => onSelectTicker(p.ticker, p.name)}>
                    {p.name} ({p.ticker})
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul aria-label="신규 검색 결과">
            {apiResults.map((r) => (
              <li key={r.symbol}>
                <button type="button" onClick={() => onSelectTicker(r.symbol, r.name)}>
                  {r.name} ({r.symbol})
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- TickerSearch.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/TickerSearch.tsx src/components/TickerSearch.test.tsx
git commit -m "feat: 내 포지션 + 신규 검색 결과를 함께 보여주는 통합 검색 컴포넌트(TickerSearch) 추가"
```

---

### Task 6: 매매 기록 추가 바텀시트 (`AddTradeSheet`)

**Files:**
- Create: `src/components/AddTradeSheet.tsx`
- Create: `src/components/AddTradeSheet.test.tsx`

**Interfaces:**
- Consumes: `createTrade` (`src/db/trades.ts`), `fetchQuote` (`src/api/quotes.ts`), `TagPicker`/`ConvictionStars`(기존, 변경 없음).
- Produces: `<AddTradeSheet db name ticker availableTags onSaved onClose />` — Task 8(ChartScreen)이 "+ 매매 기록 추가" 버튼에서 렌더링.
- 이 컴포넌트는 기존 `TradeForm`의 종목 검색을 뺀 나머지를 대체한다. `TradeForm.tsx`/`TradeForm.test.tsx`는 Task 9에서 삭제한다(지금은 유지).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/AddTradeSheet.test.tsx` (신규):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.ticker).toBe('JOBY');
    expect(saved.quantity).toBe(100);
    expect(saved.rationaleTagIds).toEqual([tag.id]);
  });

  it('allows saving with no tag, no conviction, and no memo (wellbeing: nothing is required)', async () => {
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onSaved.mock.calls[0][0].rationaleTagIds).toEqual([]);
  });

  it('saves datetime as null and datetimeUnknown as true when "시간 모름/예약매매" is toggled on', async () => {
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '시간 모름 / 예약매매' }));
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onSaved).toHaveBeenCalledOnce();
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBeNull();
    expect(saved.datetimeUnknown).toBe(true);
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={onClose} />);
    await screen.findByDisplayValue('11.36');
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- AddTradeSheet.test.tsx`
Expected: FAIL — `./AddTradeSheet` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/components/AddTradeSheet.tsx` (신규):

```tsx
import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Currency, QuantityType, Side, Tag, Trade } from '../types';
import { createTrade } from '../db/trades';
import { TagPicker } from './TagPicker';
import { ConvictionStars } from './ConvictionStars';
import { fetchQuote } from '../api/quotes';

interface AddTradeSheetProps {
  db: IDBPDatabase<TradeReviewDB>;
  ticker: string;
  name: string;
  availableTags: Tag[];
  onSaved: (trade: Trade) => void;
  onClose: () => void;
}

export function AddTradeSheet({ db, ticker, name, availableTags, onSaved, onClose }: AddTradeSheetProps) {
  const [currency, setCurrency] = useState<Currency>('USD');
  const [side, setSide] = useState<Side>('buy');
  const [price, setPrice] = useState('');
  const [quantityType, setQuantityType] = useState<QuantityType>('shares');
  const [quantityValue, setQuantityValue] = useState('');
  const [fxRateAtTrade, setFxRateAtTrade] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [conviction, setConviction] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [datetimeValue, setDatetimeValue] = useState(() => new Date().toISOString().slice(0, 10));
  const [datetimeUnknown, setDatetimeUnknown] = useState(false);

  useEffect(() => {
    fetchQuote(ticker).then((quote) => {
      if (quote?.price != null) setPrice(String(quote.price));
      if (quote?.currency) setCurrency(quote.currency);
    });
  }, [ticker]);

  async function handleSave() {
    const trade = await createTrade(db, {
      ticker,
      market: currency === 'KRW' ? 'KR' : 'US',
      name,
      currency,
      datetime: datetimeUnknown ? null : new Date(datetimeValue).toISOString(),
      datetimeUnknown,
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
    <div role="dialog" aria-label="매매 기록 추가">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <p>
          {name} ({ticker})
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
          <input aria-label="체결가" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        </label>
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
        <button type="button" aria-pressed={datetimeUnknown} onClick={() => setDatetimeUnknown((prev) => !prev)}>
          시간 모름 / 예약매매
        </button>
        <div role="radiogroup" aria-label="수량 단위">
          <button type="button" aria-pressed={quantityType === 'shares'} onClick={() => setQuantityType('shares')}>
            주
          </button>
          <button type="button" aria-pressed={quantityType === 'amount'} onClick={() => setQuantityType('amount')}>
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
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- AddTradeSheet.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/AddTradeSheet.tsx src/components/AddTradeSheet.test.tsx
git commit -m "feat: 매매 기록 추가 바텀시트(AddTradeSheet) 추가 (종목 검색과 분리)"
```

---

### Task 7: 홈 화면 (`HomeScreen`)

**Files:**
- Create: `src/components/HomeScreen.tsx`
- Create: `src/components/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `TickerSearch`(Task 5), `BackupControls`(기존, 변경 없음), `sortPositionItems`/`PositionListItem`/`SortOrder`(Task 3).
- Produces: `<HomeScreen db positions sortOrder onSortOrderChange onSelectTicker onImported />` — Task 9(App.tsx)가 `screen === 'home'`일 때 렌더링.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/HomeScreen.test.tsx` (신규):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { HomeScreen } from './HomeScreen';
import * as quotes from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

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
  vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
});

afterEach(() => db.close());

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    avgCost: 100,
    lastTradeAt: '2025-01-01T00:00:00.000Z',
    currentPrice: 110,
    ...overrides,
  };
}

describe('HomeScreen', () => {
  it('renders each position with ticker, avg cost, current price, and P&L percent', () => {
    render(
      <HomeScreen
        db={db}
        positions={[item()]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={vi.fn()}
        onImported={vi.fn()}
      />
    );

    const row = screen.getByRole('button', { name: /AAPL/ });
    expect(row).toHaveTextContent('Apple Inc.');
    expect(row).toHaveTextContent('평단 100');
    expect(row).toHaveTextContent('현재가 110');
    expect(row).toHaveTextContent('+10.0%');
  });

  it('calls onSelectTicker when a position row is clicked', async () => {
    const onSelectTicker = vi.fn();
    render(
      <HomeScreen
        db={db}
        positions={[item()]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={onSelectTicker}
        onImported={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /AAPL/ }));
    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('calls onSortOrderChange when the sort select changes', async () => {
    const onSortOrderChange = vi.fn();
    render(
      <HomeScreen
        db={db}
        positions={[item()]}
        sortOrder="recent"
        onSortOrderChange={onSortOrderChange}
        onSelectTicker={vi.fn()}
        onImported={vi.fn()}
      />
    );

    await userEvent.selectOptions(screen.getByLabelText('정렬 기준'), '이름순');
    expect(onSortOrderChange).toHaveBeenCalledWith('alphabetical');
  });

  it('selecting a search result calls onSelectTicker directly (chart-first entry, no trade required)', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
    const onSelectTicker = vi.fn();
    render(
      <HomeScreen
        db={db}
        positions={[]}
        sortOrder="recent"
        onSortOrderChange={vi.fn()}
        onSelectTicker={onSelectTicker}
        onImported={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('JOBY', '조비');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- HomeScreen.test.tsx`
Expected: FAIL — `./HomeScreen` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/components/HomeScreen.tsx` (신규):

```tsx
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import { TickerSearch } from './TickerSearch';
import { BackupControls } from './BackupControls';
import { sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

interface HomeScreenProps {
  db: IDBPDatabase<TradeReviewDB>;
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onSelectTicker: (ticker: string, name: string) => void;
  onImported: () => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: '최근 매매순',
  alphabetical: '이름순',
  pnl: '평가손익순',
};

export function HomeScreen({ db, positions, sortOrder, onSortOrderChange, onSelectTicker, onImported }: HomeScreenProps) {
  const sorted = sortPositionItems(positions, sortOrder);

  return (
    <div>
      <div>
        <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        <BackupControls db={db} onImported={onImported} />
      </div>

      <div>
        <h2>보유 포지션</h2>
        <label>
          정렬 기준
          <select
            aria-label="정렬 기준"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
          >
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
              <option key={order} value={order}>
                {SORT_LABELS[order]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul aria-label="보유 포지션 목록">
        {sorted.map((item) => {
          const pnlPercent =
            item.currentPrice != null && item.avgCost > 0
              ? ((item.currentPrice - item.avgCost) / item.avgCost) * 100
              : null;
          return (
            <li key={item.ticker}>
              <button type="button" onClick={() => onSelectTicker(item.ticker, item.name)}>
                <span>{item.ticker}</span>
                <span>{item.name}</span>
                <span>평단 {item.avgCost}</span>
                {item.currentPrice != null && <span>현재가 {item.currentPrice}</span>}
                {pnlPercent != null && (
                  <span>
                    {pnlPercent >= 0 ? '+' : ''}
                    {pnlPercent.toFixed(1)}%
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- HomeScreen.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/HomeScreen.tsx src/components/HomeScreen.test.tsx
git commit -m "feat: 홈 화면(HomeScreen) 추가 - 통합 검색 + 정렬 가능한 보유 포지션 목록"
```

---

### Task 8: 차트 화면 (`ChartScreen`)

**Files:**
- Create: `src/components/ChartScreen.tsx`
- Create: `src/components/ChartScreen.test.tsx`

**Interfaces:**
- Consumes: `PriceChart`(Task 4), `TickerSearch`(Task 5), `AddTradeSheet`(Task 6), `TradeList`/`TradeBottomSheet`(기존, 변경 없음), `adjacentTicker`/`sortPositionItems`(Task 3), `listTradesByTicker`/`getPosition`(기존).
- Produces: `<ChartScreen db ticker name tags positions sortOrder onSelectTicker onTradeSaved />` — Task 9(App.tsx)가 `screen === 'chart'`일 때 렌더링.
- 이 컴포넌트는 기존 `StockDetail`을 대체한다. `StockDetail.tsx`/`StockDetail.test.tsx`는 Task 9에서 삭제한다(지금은 유지 — `App.tsx`가 아직 그걸 쓰고 있음).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/ChartScreen.test.tsx` (신규):

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTrade } from '../db/trades';
import { ChartScreen } from './ChartScreen';
import * as quotes from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

vi.mock('../api/quotes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/quotes')>();
  return { ...actual, fetchHistory: vi.fn(), fetchQuote: vi.fn(), searchSymbols: vi.fn() };
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

function item(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    ticker: 'JOBY',
    name: '조비',
    avgCost: 11.36,
    lastTradeAt: '2025-07-10T00:00:00.000Z',
    currentPrice: 12,
    ...overrides,
  };
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  db = await openTradeReviewDB();
  vi.mocked(quotes.fetchHistory).mockResolvedValue([{ date: '2025-07-10', close: 11.36 }]);
  vi.mocked(quotes.fetchQuote).mockResolvedValue({ price: 11.36, currency: 'USD' });
  vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
});

afterEach(() => db.close());

describe('ChartScreen', () => {
  it('renders the chart immediately for a ticker with no saved trades yet', async () => {
    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();
  });

  it('disables both navigation arrows when the ticker has no position yet', async () => {
    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={vi.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: '이전 종목' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 종목' })).toBeDisabled();
  });

  it('navigates to the next position in sorted order when the next arrow is clicked', async () => {
    const onSelectTicker = vi.fn();
    render(
      <ChartScreen
        db={db}
        ticker="AAPL"
        name="Apple Inc."
        tags={[]}
        positions={[item({ ticker: 'AAPL', name: 'Apple Inc.', lastTradeAt: '2025-07-11T00:00:00.000Z' }), item()]}
        sortOrder="recent"
        onSelectTicker={onSelectTicker}
        onTradeSaved={vi.fn()}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: '다음 종목' }));
    expect(onSelectTicker).toHaveBeenCalledWith('JOBY', '조비');
  });

  it('opens the add-trade sheet and reports the saved trade, then closes the sheet', async () => {
    const onTradeSaved = vi.fn();
    render(
      <ChartScreen
        db={db}
        ticker="JOBY"
        name="조비"
        tags={[]}
        positions={[]}
        sortOrder="recent"
        onSelectTicker={vi.fn()}
        onTradeSaved={onTradeSaved}
      />
    );

    await userEvent.click(await screen.findByRole('button', { name: '+ 매매 기록 추가' }));
    await screen.findByRole('dialog', { name: '매매 기록 추가' });
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(onTradeSaved).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument();
  });

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
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- ChartScreen.test.tsx`
Expected: FAIL — `./ChartScreen` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/components/ChartScreen.tsx` (신규):

```tsx
import { useEffect, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import type { Tag, Trade } from '../types';
import { listTradesByTicker } from '../db/trades';
import { getPosition } from '../db/positions';
import { fetchHistory, type HistoryBar } from '../api/quotes';
import { PriceChart } from './PriceChart';
import { TradeList } from './TradeList';
import { TradeBottomSheet } from './TradeBottomSheet';
import { AddTradeSheet } from './AddTradeSheet';
import { TickerSearch } from './TickerSearch';
import { adjacentTicker, sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

interface ChartScreenProps {
  db: IDBPDatabase<TradeReviewDB>;
  ticker: string;
  name: string;
  tags: Tag[];
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSelectTicker: (ticker: string, name: string) => void;
  onTradeSaved: () => void;
}

export function ChartScreen({
  db,
  ticker,
  name,
  tags,
  positions,
  sortOrder,
  onSelectTicker,
  onTradeSaved,
}: ChartScreenProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [avgCost, setAvgCost] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryBar[]>([]);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showListSheet, setShowListSheet] = useState(false);

  async function reload() {
    const [ticketTrades, position] = await Promise.all([listTradesByTicker(db, ticker), getPosition(db, ticker)]);
    setTrades(ticketTrades);
    setAvgCost(position.totalQuantity !== 0 ? position.avgCost : null);
  }

  useEffect(() => {
    setShowAddSheet(false);
    setShowListSheet(false);
    setSelected(null);
    reload();
    fetchHistory(ticker).then(setHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ticker]);

  const sortedTickers = sortPositionItems(positions, sortOrder).map((p) => p.ticker);
  const prevTicker = adjacentTicker(sortedTickers, ticker, 'prev');
  const nextTicker = adjacentTicker(sortedTickers, ticker, 'next');
  const prevName = positions.find((p) => p.ticker === prevTicker)?.name ?? '';
  const nextName = positions.find((p) => p.ticker === nextTicker)?.name ?? '';

  async function handleTradeSaved() {
    await reload();
    setShowAddSheet(false);
    onTradeSaved();
  }

  return (
    <div>
      <div>
        <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
      </div>

      <div>
        <button
          type="button"
          aria-label="이전 종목"
          disabled={!prevTicker}
          onClick={() => prevTicker && onSelectTicker(prevTicker, prevName)}
        >
          ‹
        </button>
        <h2>
          {ticker} <span>{name}</span>
        </h2>
        <button
          type="button"
          aria-label="다음 종목"
          disabled={!nextTicker}
          onClick={() => nextTicker && onSelectTicker(nextTicker, nextName)}
        >
          ›
        </button>
      </div>

      <PriceChart history={history} trades={trades} avgCost={avgCost} onPointSelect={setSelected} />

      <div>
        <button type="button" onClick={() => setShowAddSheet(true)}>
          + 매매 기록 추가
        </button>
        <button type="button" onClick={() => setShowListSheet(true)}>
          매매 목록
        </button>
      </div>

      {showAddSheet && (
        <AddTradeSheet
          db={db}
          ticker={ticker}
          name={name}
          availableTags={tags}
          onSaved={handleTradeSaved}
          onClose={() => setShowAddSheet(false)}
        />
      )}

      {showListSheet && (
        <div role="dialog" aria-label="매매 목록 시트">
          <button type="button" onClick={() => setShowListSheet(false)}>
            닫기
          </button>
          <TradeList trades={trades} tags={tags} onSelect={setSelected} />
        </div>
      )}

      {selected && <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- ChartScreen.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/components/ChartScreen.tsx src/components/ChartScreen.test.tsx
git commit -m "feat: 차트 화면(ChartScreen) 추가 - 상시 검색창 + 좌우 종목 이동 + 바텀시트 액션 2종"
```

---

### Task 9: `App.tsx` 컷오버 + 옛 컴포넌트 제거

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Delete: `src/components/TradeForm.tsx`, `src/components/TradeForm.test.tsx`
- Delete: `src/components/SymbolSearch.tsx`, `src/components/SymbolSearch.test.tsx`
- Delete: `src/components/StockDetail.tsx`, `src/components/StockDetail.test.tsx`

**Interfaces:**
- Consumes: `listPositions`(Task 2), `PositionListItem`/`SortOrder`(Task 3), `HomeScreen`(Task 7), `ChartScreen`(Task 8), `fetchQuote`(기존).
- Produces: 없음(최상위 컴포넌트).

- [ ] **Step 1: 실패하는 테스트 작성 (App.test.tsx 전체 교체)**

`src/App.test.tsx` 전체 내용:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createChart } from 'lightweight-charts';
import { App } from './App';
import * as quotes from './api/quotes';

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

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('trade-review');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe('App', () => {
  it('starts on the home screen and goes straight to the chart when a new ticker is selected (no trade form gating)', async () => {
    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '매매 기록 추가' })).not.toBeInTheDocument();
  });

  it('shows the avg-cost line only after the first trade is saved for a brand-new ticker', async () => {
    // ChartScreen loads history/trades/position from separate async sources, so PriceChart's
    // effect can re-run more than once while data trickles in. Assert on whether a dashed
    // (avg-cost) series was ever added, not on a raw call count, which would be flaky here.
    const addLineSeriesSpy = vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addLineSeries: addLineSeriesSpy,
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as ReturnType<typeof createChart>);
    vi.mocked(quotes.fetchHistory).mockResolvedValue([{ date: '2026-01-01', close: 11.36 }]);

    function hasAvgCostLine() {
      return addLineSeriesSpy.mock.calls.some(([config]) => (config as { lineStyle?: number }).lineStyle === 2);
    }

    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');
    await waitFor(() => expect(hasAvgCostLine()).toBe(false)); // no position yet: no avg-cost line

    await userEvent.click(screen.getByRole('button', { name: '+ 매매 기록 추가' }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    await waitFor(() => expect(hasAvgCostLine()).toBe(true));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — 지금 `App`은 여전히 `'form' | 'detail'` 화면 모델이라 `'종목 검색'` 라벨이 매매 기록 폼 안에만 있고, 저장 없이는 차트가 뜨지 않음.

- [ ] **Step 3: `App.tsx` 교체**

`src/App.tsx` 전체 내용:

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from './db/schema';
import { listActiveTags } from './db/tags';
import { listPositions } from './db/positions';
import { requestPersistentStorage } from './lib/persistStorage';
import { fetchQuote } from './api/quotes';
import { HomeScreen } from './components/HomeScreen';
import { ChartScreen } from './components/ChartScreen';
import type { Position, Tag } from './types';
import { type PositionListItem, type SortOrder } from './lib/positionNav';

export function App() {
  const [db, setDb] = useState<IDBPDatabase<TradeReviewDB> | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [screen, setScreen] = useState<'home' | 'chart'>('home');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [activeName, setActiveName] = useState('');

  async function reloadPositions(database: IDBPDatabase<TradeReviewDB>) {
    const pos = await listPositions(database);
    setPositions(pos);
    const entries = await Promise.all(
      pos.map(async (p): Promise<[string, number | null]> => [p.ticker, (await fetchQuote(p.ticker))?.price ?? null])
    );
    setPrices(Object.fromEntries(entries));
  }

  useEffect(() => {
    requestPersistentStorage();
    openTradeReviewDB().then(async (opened) => {
      setDb(opened);
      setTags(await listActiveTags(opened));
      await reloadPositions(opened);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const positionItems: PositionListItem[] = useMemo(
    () =>
      positions.map((p) => ({
        ticker: p.ticker,
        name: p.name,
        avgCost: p.avgCost,
        lastTradeAt: p.avgCostHistory.at(-1)?.at ?? '',
        currentPrice: prices[p.ticker] ?? null,
      })),
    [positions, prices]
  );

  function handleSelectTicker(ticker: string, name: string) {
    setActiveTicker(ticker);
    setActiveName(name);
    setScreen('chart');
  }

  async function handleTradeSaved() {
    if (db) await reloadPositions(db);
  }

  async function handleImported() {
    if (!db) return;
    setTags(await listActiveTags(db));
    await reloadPositions(db);
  }

  if (!db) return <p>불러오는 중...</p>;

  return (
    <main>
      {screen === 'home' && (
        <HomeScreen
          db={db}
          positions={positionItems}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onSelectTicker={handleSelectTicker}
          onImported={handleImported}
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
    </main>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- src/App.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 옛 컴포넌트 삭제**

```bash
rm src/components/TradeForm.tsx src/components/TradeForm.test.tsx
rm src/components/SymbolSearch.tsx src/components/SymbolSearch.test.tsx
rm src/components/StockDetail.tsx src/components/StockDetail.test.tsx
```

- [ ] **Step 6: 전체 테스트 + 빌드로 검증**

Run: `npm test`
Expected: 모든 테스트 PASS (삭제된 파일에 대한 참조가 남아있지 않아야 함).

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 7: 커밋**

```bash
git add -A src/App.tsx src/App.test.tsx src/components/
git commit -m "feat: 종목 선택 시 바로 차트로 가는 흐름으로 전환 (App.tsx 컷오버, 옛 TradeForm/SymbolSearch/StockDetail 제거)"
```

---

### Task 10: 비주얼 시스템 적용 (Tailwind + 다크모드)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/HomeScreen.tsx`
- Modify: `src/components/ChartScreen.tsx`
- Modify: `src/components/AddTradeSheet.tsx`
- Modify: `src/components/TickerSearch.tsx`
- Modify: `src/components/TradeList.tsx`
- Modify: `src/components/TradeBottomSheet.tsx`
- Modify: `src/components/TagPicker.tsx`
- Modify: `src/components/ConvictionStars.tsx`
- Modify: `src/components/BackupControls.tsx`

**Interfaces:**
- Consumes: Task 1의 `--color-accent`/`--color-loss` 테마 토큰.
- Produces: 없음 — 이 태스크는 className만 추가하고 어떤 텍스트·aria-label·role·컴포넌트 시그니처도 바꾸지 않는다. 그래서 Task 2~9에서 작성한 테스트는 전부 수정 없이 그대로 통과해야 한다.

이 태스크는 로직 변경이 없으므로(스타일링 전용) red/green 사이클 대신, 각 스텝에서 변경 후 곧바로 `npm test`를 돌려 회귀가 없는지 확인한다.

- [ ] **Step 1: `App.tsx` 배경/여백**

`main` 태그에 className 추가 (다른 부분은 Task 9의 내용 그대로):

```tsx
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
```

- [ ] **Step 2: `HomeScreen.tsx` 스타일 적용**

`src/components/HomeScreen.tsx` 전체 내용:

```tsx
import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import { TickerSearch } from './TickerSearch';
import { BackupControls } from './BackupControls';
import { sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

interface HomeScreenProps {
  db: IDBPDatabase<TradeReviewDB>;
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onSelectTicker: (ticker: string, name: string) => void;
  onImported: () => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: '최근 매매순',
  alphabetical: '이름순',
  pnl: '평가손익순',
};

export function HomeScreen({ db, positions, sortOrder, onSortOrderChange, onSelectTicker, onImported }: HomeScreenProps) {
  const sorted = sortPositionItems(positions, sortOrder);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <BackupControls db={db} onImported={onImported} />
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">보유 포지션</h2>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          정렬 기준
          <select
            aria-label="정렬 기준"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
            className="ml-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
              <option key={order} value={order}>
                {SORT_LABELS[order]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul aria-label="보유 포지션 목록" className="flex flex-col gap-2.5">
        {sorted.map((item) => {
          const pnlPercent =
            item.currentPrice != null && item.avgCost > 0
              ? ((item.currentPrice - item.avgCost) / item.avgCost) * 100
              : null;
          const isLoss = pnlPercent != null && pnlPercent < 0;
          return (
            <li key={item.ticker}>
              <button
                type="button"
                onClick={() => onSelectTicker(item.ticker, item.name)}
                className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm shadow-zinc-900/5 transition active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="flex flex-col">
                  <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {item.ticker}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.name}</span>
                  <span className="mt-0.5 text-[0.68rem] text-zinc-400 dark:text-zinc-500">평단 {item.avgCost}</span>
                </span>
                <span className="flex flex-col items-end">
                  {item.currentPrice != null && (
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      현재가 {item.currentPrice}
                    </span>
                  )}
                  {pnlPercent != null && (
                    <span
                      className={
                        isLoss
                          ? 'mt-1 rounded-full bg-loss/10 px-2 py-0.5 text-xs font-bold text-loss'
                          : 'mt-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent'
                      }
                    >
                      {pnlPercent >= 0 ? '+' : ''}
                      {pnlPercent.toFixed(1)}%
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

Run: `npm test -- HomeScreen.test.tsx` — Expected: PASS (변경 없음, className만 추가).

- [ ] **Step 3: `TickerSearch.tsx` 스타일 적용**

`src/components/TickerSearch.tsx` 전체 내용:

```tsx
import { useState } from 'react';
import { searchSymbols, type SymbolResult } from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

interface TickerSearchProps {
  positions: PositionListItem[];
  onSelectTicker: (ticker: string, name: string) => void;
}

export function TickerSearch({ positions, onSelectTicker }: TickerSearchProps) {
  const [query, setQuery] = useState('');
  const [apiResults, setApiResults] = useState<SymbolResult[]>([]);

  async function handleChange(next: string) {
    setQuery(next);
    setApiResults(next.trim() ? await searchSymbols(next) : []);
  }

  const trimmed = query.trim().toLowerCase();
  const matchedPositions = trimmed
    ? positions.filter((p) => p.ticker.toLowerCase().includes(trimmed) || p.name.toLowerCase().includes(trimmed))
    : [];

  return (
    <div className="relative">
      <input
        aria-label="종목 검색"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="종목명 또는 티커 검색"
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm shadow-zinc-900/5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {trimmed && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {matchedPositions.length > 0 && (
            <ul aria-label="내 포지션 검색 결과" className="flex flex-col gap-1">
              {matchedPositions.map((p) => (
                <li key={p.ticker}>
                  <button
                    type="button"
                    onClick={() => onSelectTicker(p.ticker, p.name)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    {p.name} ({p.ticker})
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ul aria-label="신규 검색 결과" className="flex flex-col gap-1">
            {apiResults.map((r) => (
              <li key={r.symbol}>
                <button
                  type="button"
                  onClick={() => onSelectTicker(r.symbol, r.name)}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {r.name} ({r.symbol})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

Run: `npm test -- TickerSearch.test.tsx` — Expected: PASS.

- [ ] **Step 4: `ChartScreen.tsx` 스타일 적용**

`src/components/ChartScreen.tsx`에서 반환하는 JSX만 아래로 교체(상단 로직/훅은 Task 8 그대로):

```tsx
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4 pb-24">
      <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />

      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 종목"
          disabled={!prevTicker}
          onClick={() => prevTicker && onSelectTicker(prevTicker, prevName)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-400"
        >
          ‹
        </button>
        <h2 className="text-center">
          <span className="block text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">{ticker}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">{name}</span>
        </h2>
        <button
          type="button"
          aria-label="다음 종목"
          disabled={!nextTicker}
          onClick={() => nextTicker && onSelectTicker(nextTicker, nextName)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-400"
        >
          ›
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
        <PriceChart history={history} trades={trades} avgCost={avgCost} onPointSelect={setSelected} />
      </div>

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

      {showAddSheet && (
        <div className="fixed inset-0 z-20 flex items-end bg-zinc-900/40">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 dark:bg-zinc-900">
            <AddTradeSheet
              db={db}
              ticker={ticker}
              name={name}
              availableTags={tags}
              onSaved={handleTradeSaved}
              onClose={() => setShowAddSheet(false)}
            />
          </div>
        </div>
      )}

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
              className="mb-2 rounded-lg px-3 py-1 text-sm text-zinc-500 dark:text-zinc-400"
            >
              닫기
            </button>
            <TradeList trades={trades} tags={tags} onSelect={setSelected} />
          </div>
        </div>
      )}

      {selected && <TradeBottomSheet trade={selected} tags={tags} onClose={() => setSelected(null)} />}
    </div>
  );
}
```

Run: `npm test -- ChartScreen.test.tsx` — Expected: PASS.

- [ ] **Step 5: `AddTradeSheet.tsx` 스타일 적용**

`src/components/AddTradeSheet.tsx`에서 반환하는 JSX만 아래로 교체(상단 로직/훅은 Task 6 그대로):

```tsx
  return (
    <div role="dialog" aria-label="매매 기록 추가">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">
          {name} ({ticker})
        </p>
        <div role="radiogroup" aria-label="매수/매도" className="flex gap-2">
          <button
            type="button"
            aria-pressed={side === 'buy'}
            onClick={() => setSide('buy')}
            className={
              side === 'buy'
                ? 'flex-1 rounded-xl bg-accent py-2 text-sm font-bold text-white'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            매수
          </button>
          <button
            type="button"
            aria-pressed={side === 'sell'}
            onClick={() => setSide('sell')}
            className={
              side === 'sell'
                ? 'flex-1 rounded-xl bg-loss py-2 text-sm font-bold text-white'
                : 'flex-1 rounded-xl border border-zinc-200 py-2 text-sm font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            매도
          </button>
        </div>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          체결가
          <input
            aria-label="체결가"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          체결 날짜
          <input
            aria-label="체결 날짜"
            type="date"
            value={datetimeValue}
            onChange={(e) => setDatetimeValue(e.target.value)}
            disabled={datetimeUnknown}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <button
          type="button"
          aria-pressed={datetimeUnknown}
          onClick={() => setDatetimeUnknown((prev) => !prev)}
          className="self-start rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          시간 모름 / 예약매매
        </button>
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
            주
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
            원
          </button>
        </div>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          {quantityType === 'shares' ? '수량' : '금액(원)'}
          <input
            aria-label="수량 또는 금액"
            value={quantityValue}
            onChange={(e) => setQuantityValue(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        {quantityType === 'amount' && currency !== 'KRW' && (
          <label className="text-xs text-zinc-500 dark:text-zinc-400">
            체결 시점 환율
            <input
              aria-label="체결 시점 환율"
              value={fxRateAtTrade}
              onChange={(e) => setFxRateAtTrade(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </label>
        )}
        <TagPicker tags={availableTags} selectedIds={tagIds} onChange={setTagIds} />
        <ConvictionStars value={conviction} onChange={setConviction} />
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          메모
          <textarea
            aria-label="메모"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
        <button type="submit" className="rounded-xl bg-accent py-3 text-sm font-bold text-white active:scale-[0.98]">
          저장 · 평단 자동계산
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-zinc-200 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          닫기
        </button>
      </form>
    </div>
  );
}
```

Run: `npm test -- AddTradeSheet.test.tsx` — Expected: PASS.

- [ ] **Step 6: 나머지 소형 컴포넌트 스타일 적용**

`src/components/TagPicker.tsx`의 `<div>`/`<button>`에 className 추가(구조·텍스트 불변):

```tsx
    <div role="group" aria-label="근거 태그" className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          aria-pressed={selectedIds.includes(tag.id)}
          onClick={() => toggle(tag.id)}
          className={
            selectedIds.includes(tag.id)
              ? 'rounded-full bg-accent px-3 py-1 text-xs font-bold text-white'
              : 'rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
          }
        >
          {tag.name}
        </button>
      ))}
    </div>
```

`src/components/ConvictionStars.tsx`의 `<div>`에 className 추가:

```tsx
    <div role="radiogroup" aria-label="확신도" className="flex gap-1 text-lg text-amber-500">
```

`src/components/BackupControls.tsx`의 반환 `<div>`에 className 추가(텍스트/구조 불변):

```tsx
    <div className="flex items-center gap-2 text-xs">
      <button type="button" onClick={handleExport} className="rounded-lg px-2 py-1 text-zinc-500 dark:text-zinc-400">
        내보내기 (CSV)
      </button>
      <label className="rounded-lg px-2 py-1 text-zinc-500 dark:text-zinc-400">
        CSV 가져오기
        <input type="file" accept=".csv" aria-label="CSV 가져오기" onChange={handleImport} className="hidden" />
      </label>
    </div>
```

`src/components/TradeList.tsx`의 `<ul>`에 className 추가:

```tsx
    <ul aria-label="매매 목록" className="flex flex-col gap-1">
      {trades.map((trade) => {
        const tagNames = trade.rationaleTagIds
          .map((id) => tags.find((tag) => tag.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        const dateLabel = (trade.datetime ?? '날짜 모름').slice(0, 10);
        const rationaleLabel = tagNames.length > 0 ? tagNames.join(', ') : '이 매매, 기억나는 이유가 있나요?';
        return (
          <li key={trade.id}>
            <button
              type="button"
              onClick={() => onSelect(trade)}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {dateLabel} · {trade.side === 'buy' ? '매수' : '매도'} {trade.price} · {rationaleLabel}
            </button>
          </li>
        );
      })}
    </ul>
```

`src/components/TradeBottomSheet.tsx`의 반환 `<div>`에 className 추가:

```tsx
    <div role="dialog" aria-label="매매 상세" className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
```

Run: `npm test` (전체) — Expected: 모든 테스트 PASS.

- [ ] **Step 7: 최종 검증**

Run: `npm run build`
Expected: 에러 없이 성공.

라이트/다크 양쪽에서 수동 확인(`npm run dev`, OS 다크모드 토글): 홈 화면·차트 화면·바텀시트가 양쪽 모드 모두에서 텍스트 대비가 충분하고, 화면 일부만 다른 테마로 보이지 않는지 확인한다.

- [ ] **Step 8: 커밋**

```bash
git add -A src/
git commit -m "style: Tailwind 기반 카드형 비주얼 시스템 + 다크모드 적용"
```

---

## 범위 밖 (명시적 제외, 설계 문서와 동일)

- 한국 종목(`yahoo-finance2`) 관련 회복력 개선(429 재시도, 에러 로깅).
- FMP 무료 티어의 종목별 "premium" 제한(JOBY/GME 등) 대응.
- 홈 화면으로 돌아가는 명시적 "뒤로가기"/로고 버튼 — 이번 스코프는 상단 검색창을 통한 종목 전환만 지원한다(설계 문서에서 확정된 범위).
