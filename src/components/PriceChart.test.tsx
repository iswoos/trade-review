import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
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

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

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

  it('uses the final candle/MA color palette and circle markers for trades', () => {
    vi.clearAllMocks();
    const addSeriesSpy = vi.fn(() => ({ setData: vi.fn() }));
    const createSeriesMarkersSpy = vi.mocked(createSeriesMarkers);
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[
          {
            id: '1', ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
            datetime: '2026-01-01T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
            price: 11, quantityType: 'shares', quantityValue: 10, quantity: 10,
            fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
            attachment: null, recordedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    const [, candleOptions] = addSeriesSpy.mock.calls[0];
    expect(candleOptions).toMatchObject({ upColor: '#dc2626', downColor: '#2563eb' });

    // Calls: [0]=candle, [1]=MA5, [2]=MA20, [3]=MA50, [4]=MA100, [5]=MA200
    expect(addSeriesSpy.mock.calls[3][1]).toMatchObject({ color: '#8b5cf6' });
    expect(addSeriesSpy.mock.calls[5][1]).toMatchObject({ color: '#0d9488' });

    const [, markers] = createSeriesMarkersSpy.mock.calls[0];
    expect(markers).toEqual([
      expect.objectContaining({ shape: 'circle', color: '#10b981', size: 2 }),
    ]);
  });

  it('applies dark theme colors when the html element has the dark class on mount', () => {
    vi.clearAllMocks();
    document.documentElement.classList.add('dark');
    const applyOptionsSpy = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: applyOptionsSpy,
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

    const [createChartOptions] = vi.mocked(createChart).mock.calls[0].slice(1);
    expect(createChartOptions).toMatchObject({
      layout: { background: { color: '#18181b' }, textColor: '#a1a1aa', attributionLogo: false },
    });
  });

  it('re-themes the chart when the dark class is toggled after mount', async () => {
    const applyOptionsSpy = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: applyOptionsSpy,
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

    document.documentElement.classList.add('dark');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(applyOptionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ layout: expect.objectContaining({ background: { color: '#18181b' } }) })
    );
  });
});
