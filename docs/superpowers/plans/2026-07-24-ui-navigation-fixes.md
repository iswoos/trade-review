# UI/내비게이션 문제 해결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실사용 중 드러난 7가지 UI/내비게이션 문제를 해결한다 — 다크모드 수동 제어, 백업 기능 제거, 히스토리 기반 홈 내비게이션(홈 버튼+브라우저 뒤로가기), 체결 시각(선택) 입력+정렬 동률 처리, 검색 드롭다운 닫기(X버튼+바깥클릭+선택시 자동닫힘).

**Architecture:** 기존 카드형 Tailwind 디자인 시스템(zinc/accent/loss 톤, rounded-xl/2xl)을 그대로 유지한 채, 다크모드만 `prefers-color-scheme` 미디어쿼리 단독 방식에서 `dark` 클래스 기반(수동 우선, 시스템 기본값)으로 전환한다. 히스토리 내비게이션은 라우터 없이 `window.history`의 `pushState`/`replaceState`/`popstate`를 최소한으로 직접 사용한다.

**Tech Stack:** 기존 스택 그대로(React 18 + Vite + Tailwind v4 + idb + Vitest/Testing Library). 신규 의존성 없음.

## Global Constraints

- Node >=20 필요.
- 다크모드는 `src/index.css`에 `@custom-variant dark (&:where(.dark, .dark *));`를 추가해 클래스 기반으로 바꾼다. `<html>`의 `dark` 클래스는 `src/lib/theme.ts`의 `applyTheme()`로만 토글한다. 선호값은 `localStorage` 키 `trade-review-theme`에 저장하고, "시스템" 선택 시에는 `window.matchMedia('(prefers-color-scheme: dark)')`를 구독해 실시간으로 따라간다.
- 히스토리: 홈→차트 최초 진입 시 `history.pushState`, 차트 화면 안에서 종목을 바꿀 때는 `history.replaceState`(뒤로가기 스택이 종목 전환마다 쌓이지 않도록). `popstate` 리스너가 화면 상태를 복원한다.
- 이 계획은 체결시점 환율 자동조회, 메모 이미지 첨부를 포함하지 않는다(별도 작업, 사용자 확인).
- 기존 한글 aria-label/버튼 텍스트는 이 계획에서 명시적으로 바꾸는 것 외에는 그대로 유지한다.
- TDD: 로직이 있는 모든 태스크는 실패하는 테스트를 먼저 작성한다.
- 태스크당 커밋 1개.

---

### Task 1: 백업(CSV 내보내기/가져오기) 기능 완전 제거

**Files:**
- Delete: `src/components/BackupControls.tsx`, `src/components/BackupControls.test.tsx`
- Modify: `src/components/HomeScreen.tsx`, `src/components/HomeScreen.test.tsx`, `src/App.tsx`

**Interfaces:**
- Produces: `HomeScreenProps`에서 `db`, `onImported` 제거 — Task 3(ThemeToggle 연결)이 이 인터페이스를 이어받는다.

- [ ] **Step 1: 실패하는 테스트로 전환 (HomeScreen.test.tsx 전체 교체)**

`src/components/HomeScreen.test.tsx` 전체 내용:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeScreen } from './HomeScreen';
import * as quotes from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

vi.mock('../api/quotes');

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
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(<HomeScreen positions={[item()]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={vi.fn()} />);

    const row = screen.getByRole('button', { name: /AAPL/ });
    expect(row).toHaveTextContent('Apple Inc.');
    expect(row).toHaveTextContent('평단 100');
    expect(row).toHaveTextContent('현재가 110');
    expect(row).toHaveTextContent('+10.0%');
  });

  it('calls onSelectTicker when a position row is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSelectTicker = vi.fn();
    render(<HomeScreen positions={[item()]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={onSelectTicker} />);

    await userEvent.click(screen.getByRole('button', { name: /AAPL/ }));
    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('calls onSortOrderChange when the sort select changes', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    const onSortOrderChange = vi.fn();
    render(<HomeScreen positions={[item()]} sortOrder="recent" onSortOrderChange={onSortOrderChange} onSelectTicker={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('정렬 기준'), '이름순');
    expect(onSortOrderChange).toHaveBeenCalledWith('alphabetical');
  });

  it('selecting a search result calls onSelectTicker directly (chart-first entry, no trade required)', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([{ symbol: 'JOBY', name: '조비', exchange: 'NYQ' }]);
    const onSelectTicker = vi.fn();
    render(<HomeScreen positions={[]} sortOrder="recent" onSortOrderChange={vi.fn()} onSelectTicker={onSelectTicker} />);

    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('JOBY', '조비');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- HomeScreen.test.tsx`
Expected: FAIL — `HomeScreen`이 여전히 `db`/`onImported`를 필수 prop으로 요구하고 `BackupControls`를 렌더링하는 상태라 새 테스트의 props 시그니처와 맞지 않음.

- [ ] **Step 3: `HomeScreen.tsx`에서 백업 제거**

`src/components/HomeScreen.tsx` 전체 내용:

```tsx
import { TickerSearch } from './TickerSearch';
import { sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

interface HomeScreenProps {
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onSelectTicker: (ticker: string, name: string) => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: '최근 매매순',
  alphabetical: '이름순',
  pnl: '평가손익순',
};

export function HomeScreen({ positions, sortOrder, onSortOrderChange, onSelectTicker }: HomeScreenProps) {
  const sorted = sortPositionItems(positions, sortOrder);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />

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

(주: 상단 검색 영역을 감싸던 `flex items-center gap-2` 래퍼와 백업 아이콘 자리는 지금은 제거하고, Task 3에서 다크모드 토글을 위해 다시 추가한다.)

- [ ] **Step 4: `App.tsx`에서 `handleImported`/`onImported`/`db` prop 제거**

`src/App.tsx`에서 `handleImported` 함수 전체를 삭제하고, `<HomeScreen>` 렌더링을 아래로 교체:

```tsx
      {screen === 'home' && (
        <HomeScreen
          positions={positionItems}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          onSelectTicker={handleSelectTicker}
        />
      )}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- HomeScreen.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: 옛 파일 삭제 + 전체 검증**

```bash
rm src/components/BackupControls.tsx src/components/BackupControls.test.tsx
```

Run: `npm test`
Expected: 전체 PASS (BackupControls 관련 테스트 사라진 만큼 총 개수 감소, 나머지 전부 PASS).

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 7: 커밋**

```bash
git add -A src/App.tsx src/components/
git commit -m "feat: 백업(CSV 내보내기/가져오기) 기능 완전 제거"
```

---

### Task 2: 다크모드 선호값 순수 함수 (`src/lib/theme.ts`)

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`

**Interfaces:**
- Produces: `type ThemePreference = 'system' | 'light' | 'dark'`, `loadThemePreference()`, `saveThemePreference(pref)`, `nextThemePreference(current)`, `resolveIsDark(pref, systemPrefersDark)`, `applyTheme(isDark)` — Task 3(`ThemeToggle`)이 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/theme.test.ts` (신규):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadThemePreference,
  saveThemePreference,
  nextThemePreference,
  resolveIsDark,
  applyTheme,
} from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('loadThemePreference', () => {
  it('defaults to "system" when nothing is stored', () => {
    expect(loadThemePreference()).toBe('system');
  });

  it('returns the stored preference when valid', () => {
    localStorage.setItem('trade-review-theme', 'dark');
    expect(loadThemePreference()).toBe('dark');
  });

  it('falls back to "system" for an invalid stored value', () => {
    localStorage.setItem('trade-review-theme', 'garbage');
    expect(loadThemePreference()).toBe('system');
  });
});

describe('saveThemePreference', () => {
  it('persists the preference to localStorage', () => {
    saveThemePreference('light');
    expect(localStorage.getItem('trade-review-theme')).toBe('light');
  });
});

describe('nextThemePreference', () => {
  it('cycles system -> light -> dark -> system', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });
});

describe('resolveIsDark', () => {
  it('follows the system preference when preference is "system"', () => {
    expect(resolveIsDark('system', true)).toBe(true);
    expect(resolveIsDark('system', false)).toBe(false);
  });

  it('ignores the system preference when explicitly set', () => {
    expect(resolveIsDark('light', true)).toBe(false);
    expect(resolveIsDark('dark', false)).toBe(true);
  });
});

describe('applyTheme', () => {
  it('adds the dark class to the document element when isDark is true', () => {
    applyTheme(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class from the document element when isDark is false', () => {
    document.documentElement.classList.add('dark');
    applyTheme(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- theme.test.ts`
Expected: FAIL — `./theme` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/lib/theme.ts` (신규):

```ts
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'trade-review-theme';

export function loadThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function saveThemePreference(preference: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, preference);
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

export function resolveIsDark(preference: ThemePreference, systemPrefersDark: boolean): boolean {
  if (preference === 'system') return systemPrefersDark;
  return preference === 'dark';
}

export function applyTheme(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- theme.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat: 다크모드 선호값 순수 함수(theme.ts) 추가"
```

---

### Task 3: `ThemeToggle` 컴포넌트 + 홈 화면 연결 + Tailwind 클래스 기반 다크모드

**Files:**
- Create: `src/components/ThemeToggle.tsx`
- Create: `src/components/ThemeToggle.test.tsx`
- Modify: `src/components/HomeScreen.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `theme.ts`(Task 2)의 모든 export.
- Produces: `<ThemeToggle />` — 인자 없음, 내부에서 상태 관리.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/ThemeToggle.test.tsx` (신규):

```tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

afterEach(() => cleanup());

describe('ThemeToggle', () => {
  it('defaults to "시스템" and cycles to "라이트" then "다크" on repeated clicks', async () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /시스템/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: /라이트/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: /다크/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: /시스템/ })).toBeInTheDocument();
  });

  it('applies the dark class to the document element when "다크" is selected', async () => {
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button')); // -> 라이트
    await userEvent.click(screen.getByRole('button')); // -> 다크
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class when "라이트" is selected', async () => {
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button')); // -> 라이트
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('persists the preference to localStorage across remounts', async () => {
    const { unmount } = render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button')); // -> 라이트
    await userEvent.click(screen.getByRole('button')); // -> 다크
    unmount();

    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /다크/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- ThemeToggle.test.tsx`
Expected: FAIL — `./ThemeToggle` 모듈이 없음.

- [ ] **Step 3: `ThemeToggle` 구현**

`src/components/ThemeToggle.tsx` (신규):

```tsx
import { useEffect, useState } from 'react';
import {
  applyTheme,
  loadThemePreference,
  nextThemePreference,
  resolveIsDark,
  saveThemePreference,
  type ThemePreference,
} from '../lib/theme';

const LABELS: Record<ThemePreference, string> = {
  system: '시스템',
  light: '라이트',
  dark: '다크',
};

const SYMBOLS: Record<ThemePreference, string> = {
  system: '⚙',
  light: '☀',
  dark: '☾',
};

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => loadThemePreference());

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    function sync() {
      applyTheme(resolveIsDark(preference, mql.matches));
    }
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [preference]);

  function handleClick() {
    const next = nextThemePreference(preference);
    saveThemePreference(next);
    setPreference(next);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`다크모드 설정: ${LABELS[preference]} (누르면 전환)`}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
    >
      {SYMBOLS[preference]}
    </button>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- ThemeToggle.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Tailwind을 클래스 기반 다크모드로 전환**

`src/index.css` 전체 내용:

```css
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --color-accent: #10b981;
  --color-loss: #dc2626;
}
```

- [ ] **Step 6: `HomeScreen`에 `ThemeToggle` 연결**

`src/components/HomeScreen.tsx`에서 import 추가(`import { ThemeToggle } from './ThemeToggle';`)하고, 상단 검색 영역을 아래로 교체:

```tsx
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        </div>
        <ThemeToggle />
      </div>
```

- [ ] **Step 7: 전체 검증**

Run: `npm test`
Expected: 전체 PASS.

Run: `npm run build`
Expected: 에러 없이 성공.

라이트/다크/시스템 세 상태를 `npm run dev`로 직접 확인(가능하면): 버튼을 눌러 순환하면서 화면 전체가 즉시 전환되는지, OS 다크모드 설정을 바꿨을 때 "시스템" 상태에서 자동으로 따라가는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/theme.ts src/components/ThemeToggle.tsx src/components/ThemeToggle.test.tsx src/components/HomeScreen.tsx src/index.css
git commit -m "feat: 다크모드 수동 제어(시스템/라이트/다크 순환 토글) 추가"
```

---

### Task 4: 히스토리 기반 홈 내비게이션 (홈 버튼 + 브라우저 뒤로가기)

**Files:**
- Modify: `src/App.tsx`, `src/App.test.tsx`
- Modify: `src/components/ChartScreen.tsx`, `src/components/ChartScreen.test.tsx`

**Interfaces:**
- Produces: 없음(내비게이션 배선만 변경). `ChartScreen`에 "홈" 버튼(`aria-label="홈"`) 추가 — `window.history.back()` 호출.

- [ ] **Step 1: 실패하는 테스트 작성 — `ChartScreen.test.tsx`에 홈 버튼 테스트 추가**

`src/components/ChartScreen.test.tsx` 맨 아래(마지막 `it` 다음, `describe` 닫히기 전)에 추가:

```tsx
  it('calls window.history.back() when the home button is clicked', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
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

    await userEvent.click(await screen.findByRole('button', { name: '홈' }));
    expect(backSpy).toHaveBeenCalledOnce();
    backSpy.mockRestore();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- ChartScreen.test.tsx`
Expected: FAIL — "홈" 버튼이 존재하지 않음.

- [ ] **Step 3: `ChartScreen.tsx`에 홈 버튼 추가**

`src/components/ChartScreen.tsx`의 반환문에서, 기존 `<TickerSearch positions={positions} onSelectTicker={onSelectTicker} />` 한 줄을 아래로 교체:

```tsx
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="홈"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          ⌂
        </button>
        <div className="flex-1">
          <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        </div>
      </div>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- ChartScreen.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: `App.test.tsx`에 히스토리 내비게이션 테스트 추가**

`src/App.test.tsx`의 마지막 `it` 다음(닫는 `});` 전)에 추가:

```tsx
  it('pressing the browser back button returns from the chart screen to the home screen', async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    window.history.back();

    await waitFor(() => expect(screen.getByRole('list', { name: '보유 포지션 목록' })).toBeInTheDocument());
    expect(screen.queryByTestId('price-chart')).not.toBeInTheDocument();
  });

  it('clicking the home button in the chart screen navigates back to the home screen', async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    await userEvent.click(screen.getByRole('button', { name: '홈' }));

    await waitFor(() => expect(screen.getByRole('list', { name: '보유 포지션 목록' })).toBeInTheDocument());
  });

  it('switching tickers while already on the chart screen replaces history instead of stacking (one back returns to home)', async () => {
    render(<App />);
    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    // still on the chart screen - select a result again (exercises the replaceState path)
    await userEvent.type(screen.getByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비 \(JOBY\)/ }));
    await screen.findByTestId('price-chart');

    window.history.back();

    await waitFor(() => expect(screen.getByRole('list', { name: '보유 포지션 목록' })).toBeInTheDocument());
  });
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — 지금 `App`은 히스토리를 전혀 건드리지 않으므로 `window.history.back()`이 아무 화면 전환도 일으키지 않음.

- [ ] **Step 7: `App.tsx`에 히스토리 배선 추가**

`src/App.tsx`의 `handleSelectTicker` 함수를 아래로 교체:

```tsx
  function handleSelectTicker(ticker: string, name: string) {
    if (screen === 'home') {
      window.history.pushState({ screen: 'chart', ticker, name }, '');
    } else {
      window.history.replaceState({ screen: 'chart', ticker, name }, '');
    }
    setActiveTicker(ticker);
    setActiveName(name);
    setScreen('chart');
  }
```

그리고 기존 "Close the IndexedDB connection..." `useEffect` 바로 다음에 새 `useEffect`를 추가:

```tsx
  useEffect(() => {
    window.history.replaceState({ screen: 'home' }, '');
    function handlePopState(event: PopStateEvent) {
      const state = event.state as { screen: 'home' } | { screen: 'chart'; ticker: string; name: string } | null;
      if (!state || state.screen === 'home') {
        setScreen('home');
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

- [ ] **Step 8: 테스트 통과 확인**

Run: `npm test -- src/App.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 9: 전체 검증**

Run: `npm test`
Expected: 전체 PASS.

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 10: 커밋**

```bash
git add src/App.tsx src/App.test.tsx src/components/ChartScreen.tsx src/components/ChartScreen.test.tsx
git commit -m "feat: 히스토리 기반 홈 내비게이션 추가 (홈 버튼 + 브라우저 뒤로가기 지원)"
```

---

### Task 5: 체결 시각(선택) 입력 + "시간 모름/예약매매" 토글 시 값 초기화

**Files:**
- Modify: `src/components/AddTradeSheet.tsx`, `src/components/AddTradeSheet.test.tsx`

**Interfaces:**
- Produces: 없음(내부 상태/입력 필드 추가만).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/AddTradeSheet.test.tsx`의 마지막 `it` 다음(닫는 `});` 전)에 추가:

```tsx
  it('combines date and time into the saved datetime when a time is provided', async () => {
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜');
    await userEvent.clear(dateInput);
    await userEvent.type(dateInput, '2025-07-10');
    await userEvent.type(screen.getByLabelText('체결 시각'), '09:30');
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBe(new Date('2025-07-10T09:30').toISOString());
  });

  it('saves date-only (midnight) when the time field is left blank', async () => {
    const onSaved = vi.fn();
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={onSaved} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜') as HTMLInputElement;
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '10');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const saved = onSaved.mock.calls[0][0];
    expect(saved.datetime).toBe(new Date(dateInput.value).toISOString());
  });

  it('clears the date and time fields (not just disables them) when "시간 모름/예약매매" is toggled on', async () => {
    render(<AddTradeSheet db={db} ticker="JOBY" name="조비" availableTags={[]} onSaved={vi.fn()} onClose={vi.fn()} />);

    await screen.findByDisplayValue('11.36');
    const dateInput = screen.getByLabelText('체결 날짜') as HTMLInputElement;
    const timeInput = screen.getByLabelText('체결 시각') as HTMLInputElement;
    await userEvent.type(timeInput, '09:30');

    await userEvent.click(screen.getByRole('button', { name: '시간 모름 / 예약매매' }));

    expect(dateInput.value).toBe('');
    expect(timeInput.value).toBe('');
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- AddTradeSheet.test.tsx`
Expected: FAIL — "체결 시각" 입력이 없고, 토글 시 값이 지워지지 않음.

- [ ] **Step 3: 구현**

`src/components/AddTradeSheet.tsx`에서 `datetimeUnknown` state 선언 다음에 `timeValue` state 추가:

```tsx
  const [datetimeUnknown, setDatetimeUnknown] = useState(false);
  const [timeValue, setTimeValue] = useState('');
```

토글 버튼의 핸들러를 인라인 화살표 함수 대신 아래 함수로 교체(컴포넌트 본문에 함수 추가, `handleSave` 위에):

```tsx
  function toggleDatetimeUnknown() {
    setDatetimeUnknown((prev) => {
      const next = !prev;
      if (next) {
        setDatetimeValue('');
        setTimeValue('');
      } else {
        setDatetimeValue(new Date().toISOString().slice(0, 10));
      }
      return next;
    });
  }
```

`handleSave`의 `datetime` 필드 계산을 아래로 교체:

```tsx
      datetime: datetimeUnknown
        ? null
        : new Date(timeValue ? `${datetimeValue}T${timeValue}` : datetimeValue).toISOString(),
```

토글 버튼의 `onClick`을 `toggleDatetimeUnknown`으로 교체:

```tsx
        <button
          type="button"
          aria-pressed={datetimeUnknown}
          onClick={toggleDatetimeUnknown}
          className="self-start rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          시간 모름 / 예약매매
        </button>
```

"체결 날짜" `<label>` 바로 다음(토글 버튼 앞)에 새 시각 입력 추가:

```tsx
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          체결 시각 (선택)
          <input
            aria-label="체결 시각"
            type="time"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            disabled={datetimeUnknown}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- AddTradeSheet.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: 전체 검증**

Run: `npm test`
Expected: 전체 PASS.

- [ ] **Step 6: 커밋**

```bash
git add src/components/AddTradeSheet.tsx src/components/AddTradeSheet.test.tsx
git commit -m "feat: 체결 시각(선택) 입력 추가 + 시간모름 토글 시 값 초기화"
```

---

### Task 6: 최근 매매순 정렬 동률 처리 (`recordedAt` 2차 정렬)

**Files:**
- Modify: `src/types.ts`, `src/db/positions.ts`, `src/db/positions.test.ts`
- Modify: `src/lib/positionNav.ts`, `src/lib/positionNav.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `Position.lastTradeRecordedAt: string`(신규, 필수), `PositionListItem.lastTradeRecordedAt?: string`(신규, 옵셔널 — 이 값을 안 채우는 기존 테스트 픽스처들이 안 깨지도록).

- [ ] **Step 1: 실패하는 테스트 작성 — `positions.test.ts`**

`src/db/positions.test.ts`의 `getPosition` describe 블록 안 첫 번째 테스트를 아래로 교체(마지막 줄 추가), 그리고 새 테스트를 그 describe 블록 끝에 추가:

```ts
describe('getPosition', () => {
  it('derives avgCost/totalQuantity/realizedPl from stored trades, ordered by datetime', async () => {
    await createTrade(db, tradeInput({ side: 'buy', price: 10, quantityValue: 10, datetime: '2025-01-01T00:00:00.000Z' }));
    await createTrade(db, tradeInput({ side: 'buy', price: 20, quantityValue: 10, datetime: '2025-01-02T00:00:00.000Z' }));
    const lastTrade = await createTrade(db, tradeInput({ side: 'sell', price: 25, quantityValue: 5, datetime: '2025-01-03T00:00:00.000Z' }));

    const position = await getPosition(db, 'JOBY');

    expect(position.ticker).toBe('JOBY');
    expect(position.totalQuantity).toBe(15);
    expect(position.avgCost).toBeCloseTo(15, 6); // unaffected by the sell
    expect(position.realizedPl).toBeCloseTo((25 - 15) * 5, 6);
    expect(position.avgCostHistory).toHaveLength(3);
    expect(position.lastTradeRecordedAt).toBe(lastTrade.recordedAt);
  });

  it('falls back to recordedAt ordering when datetime is null (unknown-time trades)', async () => {
    await createTrade(db, tradeInput({ datetime: null, datetimeUnknown: true, price: 10, quantityValue: 10 }));
    const position = await getPosition(db, 'JOBY');
    expect(position.totalQuantity).toBe(10);
  });

  it('ties lastTradeRecordedAt to the trade with the latest occurredAt, not database insertion order', async () => {
    const chronologicallyLast = await createTrade(
      db,
      tradeInput({ price: 10, quantityValue: 10, datetime: '2025-01-05T00:00:00.000Z' })
    );
    await createTrade(db, tradeInput({ price: 20, quantityValue: 10, datetime: '2025-01-01T00:00:00.000Z' }));

    const position = await getPosition(db, 'JOBY');

    expect(position.lastTradeRecordedAt).toBe(chronologicallyLast.recordedAt);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- positions.test.ts`
Expected: FAIL — `position.lastTradeRecordedAt`이 `undefined`.

- [ ] **Step 3: `types.ts`/`positions.ts` 구현**

`src/types.ts`의 `Position` 인터페이스에 필드 추가:

```ts
export interface Position {
  ticker: string;
  name: string;
  avgCost: number;
  totalQuantity: number;
  avgCostHistory: { at: string; avgCost: number }[];
  realizedPl: number;
  lastTradeRecordedAt: string;
}
```

`src/db/positions.ts`의 `getPosition` 함수를 아래로 교체:

```ts
export async function getPosition(db: IDBPDatabase<TradeReviewDB>, ticker: string): Promise<Position> {
  const trades = sortByOccurredAt(await listTradesByTicker(db, ticker));
  let state = EMPTY_POSITION_STATE;
  const avgCostHistory: { at: string; avgCost: number }[] = [];
  let lastTradeRecordedAt = '';

  for (const trade of trades) {
    state =
      trade.side === 'buy'
        ? applyBuy(state, trade.price, trade.quantity)
        : applySell(state, trade.price, trade.quantity);
    avgCostHistory.push({ at: occurredAt(trade), avgCost: state.avgCost });
    lastTradeRecordedAt = trade.recordedAt;
  }

  return {
    ticker,
    name: trades[0]?.name ?? ticker,
    avgCost: state.avgCost,
    totalQuantity: state.totalQuantity,
    avgCostHistory,
    realizedPl: state.realizedPl,
    lastTradeRecordedAt,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- positions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: `positionNav.ts`에 동률 처리 추가 — 실패하는 테스트 먼저**

`src/lib/positionNav.test.ts`의 `sortPositionItems` describe 블록 끝에 추가:

```ts
  it('breaks a tie in "recent" order using lastTradeRecordedAt when lastTradeAt is identical', () => {
    const items = [
      item({ ticker: 'A', lastTradeAt: '2025-01-01T00:00:00.000Z', lastTradeRecordedAt: '2025-01-01T00:05:00.000Z' }),
      item({ ticker: 'B', lastTradeAt: '2025-01-01T00:00:00.000Z', lastTradeRecordedAt: '2025-01-01T00:10:00.000Z' }),
    ];
    expect(sortPositionItems(items, 'recent').map((i) => i.ticker)).toEqual(['B', 'A']);
  });
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npm test -- positionNav.test.ts`
Expected: FAIL — 지금은 `lastTradeAt`이 같으면 동률 처리 없이 원래 순서 그대로 남음(정렬 안정성에 의존, `B`가 먼저 온다는 보장 없음).

- [ ] **Step 7: 구현**

`src/lib/positionNav.ts`의 `PositionListItem` 인터페이스와 `sortPositionItems` 함수를 아래로 교체:

```ts
export interface PositionListItem {
  ticker: string;
  name: string;
  avgCost: number;
  lastTradeAt: string;
  lastTradeRecordedAt?: string;
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
    return copy.sort((a, b) => {
      const byLastTradeAt = b.lastTradeAt.localeCompare(a.lastTradeAt);
      if (byLastTradeAt !== 0) return byLastTradeAt;
      return (b.lastTradeRecordedAt ?? '').localeCompare(a.lastTradeRecordedAt ?? '');
    });
  }
  if (order === 'alphabetical') {
    return copy.sort((a, b) => a.ticker.localeCompare(b.ticker));
  }
  return copy.sort((a, b) => pnlPercent(b) - pnlPercent(a));
}
```

(`adjacentTicker` 함수는 그대로 둔다.)

- [ ] **Step 8: 테스트 통과 확인**

Run: `npm test -- positionNav.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 9: `App.tsx`에서 새 필드 채우기**

`src/App.tsx`의 `positionItems` `useMemo` 안 매핑 객체에 필드 추가:

```tsx
        .map((p) => ({
          ticker: p.ticker,
          name: p.name,
          avgCost: p.avgCost,
          lastTradeAt: p.avgCostHistory[p.avgCostHistory.length - 1]?.at ?? '',
          lastTradeRecordedAt: p.lastTradeRecordedAt,
          currentPrice: prices[p.ticker] ?? null,
        })),
```

- [ ] **Step 10: 전체 검증**

Run: `npm test`
Expected: 전체 PASS.

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 11: 커밋**

```bash
git add src/types.ts src/db/positions.ts src/db/positions.test.ts src/lib/positionNav.ts src/lib/positionNav.test.ts src/App.tsx
git commit -m "feat: 최근 매매순 정렬 동률 처리 (recordedAt 2차 정렬) 추가"
```

---

### Task 7: 검색 드롭다운 닫기 (X버튼 + 바깥 클릭 + 선택 시 자동 닫힘)

**Files:**
- Modify: `src/components/TickerSearch.tsx`, `src/components/TickerSearch.test.tsx`

**Interfaces:**
- Produces: 없음(내부 동작 변경만). 이 태스크가 "검색 결과를 선택해도 드롭다운이 안 닫혀서 화면 전환이 안 보였던" 문제를 해결한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/TickerSearch.test.tsx`의 기존 "calls onSelectTicker with the ticker and name when a result is clicked" 테스트를 아래로 교체, 그리고 새 테스트 두 개를 그 뒤에 추가(마지막 "ignores a stale..." 테스트 앞이든 뒤든 무방):

```tsx
  it('calls onSelectTicker with the ticker and name, and clears the query, when a result is clicked', async () => {
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

    const input = screen.getByLabelText('종목 검색') as HTMLInputElement;
    await userEvent.type(input, 'apple');
    await userEvent.click(await screen.findByRole('button', { name: /Apple Inc\. \(AAPL\)/ }));

    expect(onSelectTicker).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
    expect(input.value).toBe('');
    expect(screen.queryByRole('list', { name: '내 포지션 검색 결과' })).not.toBeInTheDocument();
  });

  it('clears the query when the clear (X) button is clicked', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(<TickerSearch positions={[]} onSelectTicker={vi.fn()} />);

    const input = screen.getByLabelText('종목 검색') as HTMLInputElement;
    await userEvent.type(input, 'apple');
    await userEvent.click(await screen.findByRole('button', { name: '검색어 지우기' }));

    expect(input.value).toBe('');
    expect(screen.queryByRole('list', { name: '신규 검색 결과' })).not.toBeInTheDocument();
  });

  it('clears the query when clicking outside the search component', async () => {
    vi.mocked(quotes.searchSymbols).mockResolvedValue([]);
    render(
      <div>
        <TickerSearch positions={[]} onSelectTicker={vi.fn()} />
        <button type="button">바깥 영역</button>
      </div>
    );

    const input = screen.getByLabelText('종목 검색') as HTMLInputElement;
    await userEvent.type(input, 'apple');
    await screen.findByRole('list', { name: '신규 검색 결과' });

    await userEvent.click(screen.getByRole('button', { name: '바깥 영역' }));

    expect(input.value).toBe('');
    expect(screen.queryByRole('list', { name: '신규 검색 결과' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- TickerSearch.test.tsx`
Expected: FAIL — 지금은 선택해도 `query`가 안 지워지고, X버튼도 없고, 바깥 클릭 처리도 없음.

- [ ] **Step 3: 구현**

`src/components/TickerSearch.tsx` 전체 내용:

```tsx
import { useEffect, useRef, useState } from 'react';
import { searchSymbols, type SymbolResult } from '../api/quotes';
import type { PositionListItem } from '../lib/positionNav';

interface TickerSearchProps {
  positions: PositionListItem[];
  onSelectTicker: (ticker: string, name: string) => void;
}

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

  function selectTicker(ticker: string, name: string) {
    clearSearch();
    onSelectTicker(ticker, name);
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        clearSearch();
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const trimmed = query.trim().toLowerCase();
  const matchedPositions = trimmed
    ? positions.filter((p) => p.ticker.toLowerCase().includes(trimmed) || p.name.toLowerCase().includes(trimmed))
    : [];

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          aria-label="종목 검색"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="종목명 또는 티커 검색"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 pr-9 text-sm text-zinc-900 shadow-sm shadow-zinc-900/5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          >
            ✕
          </button>
        )}
      </div>
      {trimmed && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {matchedPositions.length > 0 && (
            <ul aria-label="내 포지션 검색 결과" className="flex flex-col gap-1">
              {matchedPositions.map((p) => (
                <li key={p.ticker}>
                  <button
                    type="button"
                    onClick={() => selectTicker(p.ticker, p.name)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
                  onClick={() => selectTicker(r.symbol, r.name)}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
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

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- TickerSearch.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: 전체 검증**

Run: `npm test`
Expected: 전체 PASS.

Run: `npm run build`
Expected: 에러 없이 성공.

- [ ] **Step 6: 커밋**

```bash
git add src/components/TickerSearch.tsx src/components/TickerSearch.test.tsx
git commit -m "feat: 검색 드롭다운 닫기(X버튼+바깥클릭+선택시 자동닫힘) 추가"
```

---

## 범위 밖 (명시적 제외, 사용자 확인)

- 체결시점 환율 자동조회(체결 날짜 기반 외부 API 연동)
- 메모 이미지 첨부
