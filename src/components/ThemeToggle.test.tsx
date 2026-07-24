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
