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
