import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('goes from the trade form to the stock detail screen after saving', async () => {
    render(<App />);

    await userEvent.type(await screen.findByLabelText('종목 검색'), 'joby');
    await userEvent.click(await screen.findByRole('button', { name: /조비/ }));
    await userEvent.type(screen.getByLabelText('수량 또는 금액'), '100');
    await userEvent.click(screen.getByRole('button', { name: '저장 · 평단 자동계산' }));

    expect(await screen.findByRole('tablist', { name: '종목 상세 탭' })).toBeInTheDocument();
  });
});
