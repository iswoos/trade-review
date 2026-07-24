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
