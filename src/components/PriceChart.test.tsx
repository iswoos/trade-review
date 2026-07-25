import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
import { PriceChart } from './PriceChart';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    subscribeClick: vi.fn(),
    priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
    timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
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
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
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
    const candleSetData = vi.fn();
    const addSeriesSpy = vi.fn((_seriesType?: unknown, _options?: unknown) => ({ setData: vi.fn() }));
    addSeriesSpy.mockImplementationOnce(() => ({ setData: candleSetData }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
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
    expect(candleSetData).toHaveBeenCalledWith([
      { time: '2026-01-01', open: 10, high: 12, low: 9, close: 11 },
    ]);
  });

  it('uses the final candle/MA color palette and circle markers for trades', () => {
    vi.clearAllMocks();
    const addSeriesSpy = vi.fn((_seriesType?: unknown, _options?: unknown) => ({ setData: vi.fn() }));
    const createSeriesMarkersSpy = vi.mocked(createSeriesMarkers);
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
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
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
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
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
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

  it('renders a moving-average legend with period and latest value, color-matched', () => {
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      subscribeClick: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn() })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    const history = Array.from({ length: 5 }, (_, i) => ({
      date: `2026-01-0${i + 1}`,
      open: 10,
      high: 10,
      low: 10,
      close: 10 + i,
    }));

    render(<PriceChart history={history} trades={[]} avgCost={null} onPointSelect={() => {}} />);

    const legend = screen.getByTestId('ma-legend');
    // 5-day MA over closes [10,11,12,13,14] = 12, on the only day it has enough data (the 5th bar).
    expect(legend).toHaveTextContent('5일');
    expect(legend).toHaveTextContent('12');
  });

  it('zooms only the price scale when a touch drag starts in the price-axis region', () => {
    const setAutoScale = vi.fn();
    const setVisibleRange = vi.fn();
    const getVisibleRange = vi.fn(() => ({ from: 0, to: 100 }));
    const priceScale = vi.fn(() => ({ width: () => 50, setAutoScale, setVisibleRange, getVisibleRange }));
    let containerEl!: HTMLDivElement;
    vi.mocked(createChart).mockImplementation((el) => {
      containerEl = el as HTMLDivElement;
      return {
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        applyOptions: vi.fn(),
        subscribeClick: vi.fn(),
        priceScale,
        timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 10 })) })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>;
    });

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    // jsdom's getBoundingClientRect() always returns zeros regardless of clientWidth/clientHeight —
    // mock it directly so the region-detection math in PriceChart has real width/height to work with.
    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON: () => '',
    });

    // Touch starting inside the rightmost 50px (the price-scale width) at y=100 (not in the bottom 28px).
    const touchStart = new Event('touchstart', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 280, clientY: 100 }] });
    containerEl.dispatchEvent(touchStart);

    const touchMove = new Event('touchmove', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchMove, 'touches', { value: [{ clientX: 280, clientY: 60 }] });
    containerEl.dispatchEvent(touchMove);

    expect(setAutoScale).toHaveBeenCalledWith(false);
    expect(setVisibleRange).toHaveBeenCalled();
  });

  it('does not disable auto-scale when the price scale has no visible range yet on touchstart', () => {
    const setAutoScale = vi.fn();
    const setVisibleRange = vi.fn();
    const getVisibleRange = vi.fn(() => null);
    const priceScale = vi.fn(() => ({ width: () => 50, setAutoScale, setVisibleRange, getVisibleRange }));
    let containerEl!: HTMLDivElement;
    vi.mocked(createChart).mockImplementation((el) => {
      containerEl = el as HTMLDivElement;
      return {
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        applyOptions: vi.fn(),
        subscribeClick: vi.fn(),
        priceScale,
        timeScale: vi.fn(() => ({ setVisibleLogicalRange: vi.fn(), getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 10 })) })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>;
    });

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON: () => '',
    });

    // Touch starting inside the rightmost 50px (the price-scale width) while getVisibleRange() is still null.
    const touchStart = new Event('touchstart', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 280, clientY: 100 }] });
    containerEl.dispatchEvent(touchStart);

    const touchMove = new Event('touchmove', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchMove, 'touches', { value: [{ clientX: 280, clientY: 60 }] });
    containerEl.dispatchEvent(touchMove);

    expect(setAutoScale).not.toHaveBeenCalled();
    expect(setVisibleRange).not.toHaveBeenCalled();
  });

  it('zooms only the time scale when a touch drag starts in the time-axis region', () => {
    const setVisibleLogicalRange = vi.fn();
    const getVisibleLogicalRange = vi.fn(() => ({ from: 0, to: 10 }));
    let containerEl!: HTMLDivElement;
    vi.mocked(createChart).mockImplementation((el) => {
      containerEl = el as HTMLDivElement;
      return {
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        applyOptions: vi.fn(),
        subscribeClick: vi.fn(),
        priceScale: vi.fn(() => ({ width: () => 50, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
        timeScale: vi.fn(() => ({ setVisibleLogicalRange, getVisibleLogicalRange })),
        remove: vi.fn(),
      } as unknown as ReturnType<typeof createChart>;
    });

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON: () => '',
    });

    // Touch starting in the bottom 28px (time-axis region), away from the right price-scale column.
    const touchStart = new Event('touchstart', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchStart, 'touches', { value: [{ clientX: 100, clientY: 290 }] });
    containerEl.dispatchEvent(touchStart);

    const touchMove = new Event('touchmove', { bubbles: true }) as unknown as TouchEvent;
    Object.defineProperty(touchMove, 'touches', { value: [{ clientX: 160, clientY: 290 }] });
    containerEl.dispatchEvent(touchMove);

    expect(setVisibleLogicalRange).toHaveBeenCalled();
  });
});
