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
      <PriceChart
        history={[{ date: '2026-01-01', close: 10 }]}
        trades={[]}
        avgCost={10}
        onPointSelect={() => {}}
      />
    );
    expect(screen.getByTestId('price-chart')).toBeInTheDocument();
  });

  it('skips the avg-cost line entirely when avgCost is null (no position yet)', () => {
    const addLineSeriesSpy = vi.fn(() => ({ setData: vi.fn(), setMarkers: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addLineSeries: addLineSeriesSpy,
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart history={[{ date: '2026-01-01', close: 10 }]} trades={[]} avgCost={null} onPointSelect={() => {}} />
    );

    // price series(1) + 5 moving averages = 6 calls; no 7th call for the avg-cost line.
    expect(addLineSeriesSpy).toHaveBeenCalledTimes(6);
  });
});
