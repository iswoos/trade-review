import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import { PriceChart } from './PriceChart';

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: vi.fn(() => ({ setData: vi.fn() })),
    applyOptions: vi.fn(),
    priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
    timeScale: vi.fn(() => ({
      setVisibleLogicalRange: vi.fn(),
      getVisibleLogicalRange: vi.fn(),
      timeToCoordinate: vi.fn(() => null),
      subscribeVisibleLogicalRangeChange: vi.fn(),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
    })),
    remove: vi.fn(),
  })),
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
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
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
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
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

  it('uses the final candle/MA color palette and suppresses per-series price-axis badges', () => {
    vi.clearAllMocks();
    const addSeriesSpy = vi.fn((_seriesType?: unknown, _options?: unknown) => ({ setData: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
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

    const [, candleOptions] = addSeriesSpy.mock.calls[0];
    expect(candleOptions).toMatchObject({ upColor: '#dc2626', downColor: '#2563eb' });

    // Calls: [0]=candle, [1]=MA5, [2]=MA20, [3]=MA50, [4]=MA100, [5]=MA200
    expect(addSeriesSpy.mock.calls[3][1]).toMatchObject({ color: '#8b5cf6' });
    expect(addSeriesSpy.mock.calls[5][1]).toMatchObject({ color: '#0d9488' });

    // Every MA series suppresses its own price-axis last-value badge — the
    // top-right legend is the labeled replacement for this data, so the
    // native per-series badges would just be redundant, unlabeled clutter.
    for (let i = 1; i <= 5; i++) {
      expect(addSeriesSpy.mock.calls[i][1]).toMatchObject({ lastValueVisible: false });
    }
  });

  it('renders one arrow per trade below the time axis, colored red for buy and blue for sell', () => {
    const timeToCoordinate = vi.fn((time: string) => (time === '2026-01-01' ? 120 : null));
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
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

    const arrow = screen.getByRole('button', { name: '매수 2026-01-01' });
    expect(arrow).toHaveTextContent('▲');
    expect(arrow).not.toHaveTextContent('×');
    expect(arrow.style.color).toBe('rgb(220, 38, 38)'); // #dc2626
    expect(arrow.style.left).toBe('120px');
  });

  it('collapses same-day, same-side trades into a single arrow with a ×N count instead of stacking', () => {
    const timeToCoordinate = vi.fn(() => 120);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    const baseTrade = {
      ticker: 'JOBY', market: 'US' as const, name: '조비', currency: 'USD' as const,
      datetimeUnknown: false, quantityType: 'shares' as const, quantityValue: 10, quantity: 10,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
      attachment: null, recordedAt: '2026-01-01T00:00:00.000Z',
    };

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[
          { ...baseTrade, id: '1', side: 'buy', price: 11, datetime: '2026-01-01T00:00:00.000Z' },
          { ...baseTrade, id: '2', side: 'buy', price: 11.5, datetime: '2026-01-01T05:00:00.000Z' },
          { ...baseTrade, id: '3', side: 'sell', price: 12, datetime: '2026-01-01T06:00:00.000Z' },
        ]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    const buyArrow = screen.getByRole('button', { name: '매수 2026-01-01' });
    const sellArrow = screen.getByRole('button', { name: '매도 2026-01-01' });
    expect(buyArrow).toHaveTextContent('▲ ×2');
    expect(sellArrow).toHaveTextContent('▼');
    expect(sellArrow).not.toHaveTextContent('×');
  });

  it('offsets buy and sell arrows apart when both fall on the same day, instead of overlapping', () => {
    const timeToCoordinate = vi.fn(() => 120);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    const baseTrade = {
      ticker: 'JOBY', market: 'US' as const, name: '조비', currency: 'USD' as const,
      datetimeUnknown: false, quantityType: 'shares' as const, quantityValue: 10, quantity: 10,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
      attachment: null, recordedAt: '2026-01-01T00:00:00.000Z',
    };

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[
          { ...baseTrade, id: '1', side: 'buy', price: 11, datetime: '2026-01-01T00:00:00.000Z' },
          { ...baseTrade, id: '2', side: 'sell', price: 12, datetime: '2026-01-01T06:00:00.000Z' },
        ]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    const buyArrow = screen.getByRole('button', { name: '매수 2026-01-01' });
    const sellArrow = screen.getByRole('button', { name: '매도 2026-01-01' });
    expect(buyArrow.style.left).toBe('112px'); // 120 - 8
    expect(sellArrow.style.left).toBe('128px'); // 120 + 8
  });

  it('calls onPointSelect with the matching trade when a trade arrow is clicked', () => {
    const timeToCoordinate = vi.fn(() => 120);
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    const trade = {
      id: '1', ticker: 'JOBY', market: 'US' as const, name: '조비', currency: 'USD' as const,
      datetime: '2026-01-01T00:00:00.000Z', datetimeUnknown: false, side: 'buy' as const,
      price: 11, quantityType: 'shares' as const, quantityValue: 10, quantity: 10,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
      attachment: null, recordedAt: '2026-01-01T00:00:00.000Z',
    };
    const onPointSelect = vi.fn();

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[trade]}
        avgCost={null}
        onPointSelect={onPointSelect}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '매수 2026-01-01' }));
    expect(onPointSelect).toHaveBeenCalledWith(trade);
  });

  it('suppresses the avg-cost line price-axis last-value badge too', () => {
    vi.clearAllMocks();
    const addSeriesSpy = vi.fn((_seriesType?: unknown, _options?: unknown) => ({ setData: vi.fn() }));
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[{ date: '2026-01-01', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={10.5}
        onPointSelect={() => {}}
      />
    );

    // Calls: [0]=candle, [1..5]=MAs, [6]=avg-cost line.
    expect(addSeriesSpy.mock.calls[6][1]).toMatchObject({ lastValueVisible: false });
  });

  it('applies dark theme colors when the html element has the dark class on mount', () => {
    vi.clearAllMocks();
    document.documentElement.classList.add('dark');
    const applyOptionsSpy = vi.fn();
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: applyOptionsSpy,
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
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
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
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
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
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
        priceScale,
        timeScale: vi.fn(() => ({
          setVisibleLogicalRange: vi.fn(),
          getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 10 })),
          timeToCoordinate: vi.fn(() => null),
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        })),
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
        priceScale,
        timeScale: vi.fn(() => ({
          setVisibleLogicalRange: vi.fn(),
          getVisibleLogicalRange: vi.fn(() => ({ from: 0, to: 10 })),
          timeToCoordinate: vi.fn(() => null),
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        })),
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
        priceScale: vi.fn(() => ({ width: () => 50, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
        timeScale: vi.fn(() => ({
          setVisibleLogicalRange,
          getVisibleLogicalRange,
          timeToCoordinate: vi.fn(() => null),
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        })),
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

  it('shows 일/주/월/년 tabs, defaulting to 일 (daily, unchanged bars)', () => {
    render(
      <PriceChart
        history={[{ date: '2026-07-17', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: '일' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '주' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('aggregates into weekly candles when the 주 tab is clicked', async () => {
    const candleSetData = vi.fn();
    const addSeriesSpy = vi.fn((seriesType?: unknown, _options?: unknown) =>
      seriesType === CandlestickSeries ? { setData: candleSetData } : { setData: vi.fn() }
    );
    vi.mocked(createChart).mockReturnValue({
      addSeries: addSeriesSpy,
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    render(
      <PriceChart
        history={[
          { date: '2026-07-13', open: 100, high: 105, low: 99, close: 102 },
          { date: '2026-07-14', open: 102, high: 108, low: 101, close: 106 },
          { date: '2026-07-20', open: 107, high: 112, low: 106, close: 110 },
        ]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: '주' }));

    expect(candleSetData).toHaveBeenLastCalledWith([
      { time: '2026-07-13', open: 100, high: 108, low: 99, close: 106 },
      { time: '2026-07-20', open: 107, high: 112, low: 106, close: 110 },
    ]);
  });

  it('computes the moving-average legend from weekly closes when the 주 tab is active', async () => {
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate: vi.fn(() => null),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    // One bar per Monday, 5 consecutive weeks - closes [10,11,12,13,14], same
    // shape as the existing daily 5-MA legend test, but one bar = one week.
    const history = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 6, 13 + i * 7)).toISOString().slice(0, 10),
      open: 10,
      high: 10,
      low: 10,
      close: 10 + i,
    }));

    render(<PriceChart history={history} trades={[]} avgCost={null} onPointSelect={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '주' }));

    const legend = await screen.findByTestId('ma-legend');
    expect(legend).toHaveTextContent('5주');
    expect(legend).toHaveTextContent('12');
  });

  it('buckets a trade arrow by its aggregated (weekly) candle, not its exact daily date', async () => {
    const timeToCoordinate = vi.fn((time: string) => (time === '2026-07-13' ? 50 : null));
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    const history = [
      { date: '2026-07-13', open: 10, high: 12, low: 9, close: 11 }, // Monday, week-bucket start
      { date: '2026-07-14', open: 11, high: 13, low: 10, close: 12 }, // Tuesday, same week
    ];
    const trade = {
      id: '1', ticker: 'JOBY', market: 'US' as const, name: '조비', currency: 'USD' as const,
      datetime: '2026-07-14T00:00:00.000Z', datetimeUnknown: false, side: 'buy' as const,
      price: 12, quantityType: 'shares' as const, quantityValue: 10, quantity: 10,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
      attachment: null, recordedAt: '2026-07-14T00:00:00.000Z',
    };

    render(<PriceChart history={history} trades={[trade]} avgCost={null} onPointSelect={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '주' }));

    // The trade happened Tuesday 07-14, but the weekly bucket containing it
    // starts Monday 07-13 - the arrow must be looked up (and rendered) at
    // that bucket's date, not the trade's own exact day.
    expect(await screen.findByRole('button', { name: '매수 2026-07-13' })).toBeInTheDocument();
    expect(timeToCoordinate).toHaveBeenCalledWith('2026-07-13');
  });

  it('buckets a trade dated on a holiday that shifted the week\'s first trading day later, to the correct (not previous) week', async () => {
    const timeToCoordinate = vi.fn((time: string) => (time === '2026-07-14' ? 50 : null));
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    // Monday 2026-07-13 is a holiday (no bar) - the week's real first trading
    // day is Tuesday 2026-07-14. A trade dated the holiday Monday itself
    // must still land on that week's candle (07-14), not the prior week's.
    const history = [
      { date: '2026-07-06', open: 10, high: 11, low: 9, close: 10 }, // prior week
      { date: '2026-07-14', open: 10, high: 12, low: 9, close: 11 }, // week of 7/13, first real bar
      { date: '2026-07-15', open: 11, high: 13, low: 10, close: 12 },
    ];
    const trade = {
      id: '1', ticker: 'JOBY', market: 'US' as const, name: '조비', currency: 'USD' as const,
      datetime: '2026-07-13T00:00:00.000Z', datetimeUnknown: false, side: 'buy' as const,
      price: 11, quantityType: 'shares' as const, quantityValue: 10, quantity: 10,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
      attachment: null, recordedAt: '2026-07-13T00:00:00.000Z',
    };

    render(<PriceChart history={history} trades={[trade]} avgCost={null} onPointSelect={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '주' }));

    expect(await screen.findByRole('button', { name: '매수 2026-07-14' })).toBeInTheDocument();
  });

  it('does not render an arrow for a trade dated on a non-trading day in the default 일 (day) view', async () => {
    const timeToCoordinate = vi.fn((time: string) => (time === '2026-07-17' ? 50 : null));
    vi.mocked(createChart).mockReturnValue({
      addSeries: vi.fn(() => ({ setData: vi.fn() })),
      applyOptions: vi.fn(),
      priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
      timeScale: vi.fn(() => ({
        setVisibleLogicalRange: vi.fn(),
        getVisibleLogicalRange: vi.fn(),
        timeToCoordinate,
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      })),
      remove: vi.fn(),
    } as unknown as ReturnType<typeof createChart>);

    // 2026-07-18 is a Saturday - no bar exists for it. In the default day
    // view this must NOT resolve to the nearest prior trading day (07-17);
    // it must be dropped entirely, matching this app's pre-existing behavior.
    const history = [
      { date: '2026-07-17', open: 10, high: 12, low: 9, close: 11 },
      { date: '2026-07-20', open: 11, high: 13, low: 10, close: 12 },
    ];
    const trade = {
      id: '1', ticker: 'JOBY', market: 'US' as const, name: '조비', currency: 'USD' as const,
      datetime: '2026-07-18T00:00:00.000Z', datetimeUnknown: false, side: 'buy' as const,
      price: 11, quantityType: 'shares' as const, quantityValue: 10, quantity: 10,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '',
      attachment: null, recordedAt: '2026-07-18T00:00:00.000Z',
    };

    render(<PriceChart history={history} trades={[trade]} avgCost={null} onPointSelect={() => {}} />);

    expect(screen.queryByRole('button', { name: /매수/ })).not.toBeInTheDocument();
  });

  it('fully recreates the chart (resetting any zoom/pan) when the period tab changes', async () => {
    vi.clearAllMocks();
    const firstRemove = vi.fn();
    const secondRemove = vi.fn();
    let callCount = 0;
    vi.mocked(createChart).mockImplementation(() => {
      callCount += 1;
      return {
        addSeries: vi.fn(() => ({ setData: vi.fn() })),
        applyOptions: vi.fn(),
        priceScale: vi.fn(() => ({ width: () => 0, setAutoScale: vi.fn(), setVisibleRange: vi.fn(), getVisibleRange: vi.fn() })),
        timeScale: vi.fn(() => ({
          setVisibleLogicalRange: vi.fn(),
          getVisibleLogicalRange: vi.fn(),
          timeToCoordinate: vi.fn(() => null),
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        })),
        remove: callCount === 1 ? firstRemove : secondRemove,
      } as unknown as ReturnType<typeof createChart>;
    });

    render(
      <PriceChart
        history={[{ date: '2026-07-17', open: 10, high: 12, low: 9, close: 11 }]}
        trades={[]}
        avgCost={null}
        onPointSelect={() => {}}
      />
    );
    expect(createChart).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '주' }));

    // The old chart is torn down and a brand-new instance created - a fresh
    // chart has no memory of any prior zoom/pan, so this structurally
    // guarantees the view resets to show all of the new period's bars.
    expect(firstRemove).toHaveBeenCalledOnce();
    expect(createChart).toHaveBeenCalledTimes(2);
  });
});
