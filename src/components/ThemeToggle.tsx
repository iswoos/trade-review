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
