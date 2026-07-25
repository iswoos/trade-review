import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { PriceChart } from './PriceChart';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    subscribeClick: vi.fn(),
    remove: vi.fn(),
  })),
  createSeriesMarkers: vi.fn(() => ({ setMarkers: vi.fn() })),
  CandlestickSeries: {},
  LineSeries: {},
  LineStyle: { Dashed: 2 },
}));

describe('PriceChart', () => {
  it('renders a chart container without crashing', () => {
    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 11, low: 9, close: 10 }]}
        trades={[]}
        avgCost={10}
        onPointSelect={() => {}}
      />
    );
    expect(screen.getByTestId('price-chart')).toBeInTheDocument();
  });

  it('skips the avg-cost line entirely when avgCost is null (no position yet)', () => {
    const addSeriesSpy = vi.fn(() => ({ setData: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 11, low: 9, close: 10 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    // candlestick price series(1) + 5 moving averages = 6 calls; no 7th call for the avg-cost line.
    expect(addSeriesSpy).toHaveBeenCalledTimes(6);
  });

  it('adds the price series as a candlestick series with OHLC data', () => {
    const addSeriesSpy = vi.fn((_seriesType?: unknown, _options?: unknown) => ({ setData: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    const [seriesType] = addSeriesSpy.mock.calls[0];
    expect(seriesType).toBe(CandlestickSeries);
  });
});
