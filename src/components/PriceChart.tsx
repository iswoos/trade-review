import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
} from 'lightweight-charts';
import type { HistoryBar } from '../api/quotes';
import type { Trade } from '../types';
import { simpleMovingAverage } from '../lib/movingAverage';

interface PriceChartProps {
  history: HistoryBar[];
  trades: Trade[];
  avgCost: number | null;
  onPointSelect: (trade: Trade) => void;
}

interface TradeArrow {
  time: string;
  side: Trade['side'];
  count: number;
  x: number;
  offsetX: number;
}

const ARROW_COLOR: Record<Trade['side'], string> = { buy: '#dc2626', sell: '#2563eb' };
// When a date has both a buy and a sell, nudge each arrow off-center so they
// sit side by side instead of overlapping at the exact same x-coordinate.
const BOTH_SIDES_OFFSET = 8;

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

function themeOptions(isDark: boolean) {
  return isDark
    ? {
        layout: { background: { color: '#18181b' }, textColor: '#a1a1aa', attributionLogo: false },
        grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } },
      }
    : {
        layout: { background: { color: '#ffffff' }, textColor: '#71717a', attributionLogo: false },
        grid: { vertLines: { color: '#e5e7eb' }, horzLines: { color: '#e5e7eb' } },
      };
}

export function PriceChart({ history, trades, avgCost, onPointSelect }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [legend, setLegend] = useState<{ label: string; color: string; value: number }[]>([]);
  const [arrows, setArrows] = useState<TradeArrow[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 300,
      handleScroll: { horzTouchDrag: true },
      ...themeOptions(isDarkMode()),
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#dc2626',
      downColor: '#2563eb',
      borderUpColor: '#dc2626',
      borderDownColor: '#2563eb',
      wickUpColor: '#dc2626',
      wickDownColor: '#2563eb',
    });
    candleSeries.setData(
      history.map((bar) => ({ time: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close }))
    );

    const closeValues = history.map((bar) => bar.close);
    // ADR-0008: MA cap expanded from 1~2 (20/60일) to 5 (5/20/50/100/200일); 20일·200일 emphasized (lineWidth 3 vs 1).
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4; label: string }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1, label: '5일' },
      { window: 20, color: '#f59e0b', lineWidth: 3, label: '20일' },
      { window: 50, color: '#8b5cf6', lineWidth: 1, label: '50일' },
      { window: 100, color: '#6366f1', lineWidth: 1, label: '100일' },
      { window: 200, color: '#0d9488', lineWidth: 3, label: '200일' },
    ];
    const legendEntries: { label: string; color: string; value: number }[] = [];
    for (const ma of MOVING_AVERAGES) {
      // lastValueVisible defaults to true, which stacks a colored price-axis
      // badge per series; with 5 MAs + the avg-cost line that clutters the
      // axis with unlabeled numbers. The top-right legend (below) is the
      // labeled replacement for this data, so the axis badges are redundant.
      const series = chart.addSeries(LineSeries, { color: ma.color, lineWidth: ma.lineWidth, lastValueVisible: false });
      const maValues = simpleMovingAverage(closeValues, ma.window);
      series.setData(
        maValues
          .map((value, i) => ({ time: history[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
      const latest = [...maValues].reverse().find((value): value is number => value != null);
      if (latest != null) {
        legendEntries.push({ label: ma.label, color: ma.color, value: latest });
      }
    }
    setLegend(legendEntries);

    if (avgCost != null && history.length > 0) {
      const avgCostSeries = chart.addSeries(LineSeries, {
        color: '#ea580c',
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
      });
      avgCostSeries.setData([
        { time: history[0].date, value: avgCost },
        { time: history[history.length - 1].date, value: avgCost },
      ]);
    }

    const rightScale = chart.priceScale('right');
    const timeScale = chart.timeScale();
    const TIME_AXIS_HEIGHT = 28;

    // Trade markers used to render on the candle itself (belowBar/aboveBar),
    // which lightweight-charts positions relative to the price scale — when
    // multiple trades landed on the same bar, each extra marker was offset
    // further away, reading as an awkward, disconnected gap. Rendering them
    // as a separate arrow row below the time axis (real DOM elements, not
    // chart-native markers) decouples their position from price entirely and
    // gives each one its own tap target, so no distance/duration heuristic is
    // needed to tell a tap from a pan/zoom drag.
    function computeArrows() {
      const groups = new Map<string, { buy: number; sell: number }>();
      for (const t of trades) {
        if (!t.datetime) continue;
        const time = t.datetime.slice(0, 10);
        const g = groups.get(time) ?? { buy: 0, sell: 0 };
        g[t.side] += 1;
        groups.set(time, g);
      }
      const next: TradeArrow[] = [];
      for (const [time, g] of groups) {
        const x = timeScale.timeToCoordinate(time);
        if (x == null) continue;
        const bothSides = g.buy > 0 && g.sell > 0;
        if (g.buy > 0) {
          next.push({ time, side: 'buy', count: g.buy, x, offsetX: bothSides ? -BOTH_SIDES_OFFSET : 0 });
        }
        if (g.sell > 0) {
          next.push({ time, side: 'sell', count: g.sell, x, offsetX: bothSides ? BOTH_SIDES_OFFSET : 0 });
        }
      }
      setArrows(next);
    }
    computeArrows();
    timeScale.subscribeVisibleLogicalRangeChange(computeArrows);

    let dragMode: 'price' | 'time' | null = null;
    let dragStart: { x: number; y: number } | null = null;
    let dragStartPriceRange: { from: number; to: number } | null = null;
    let dragStartLogicalRange: { from: number; to: number } | null = null;

    function handleTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch) return;
      const rect = container!.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (x >= rect.width - rightScale.width()) {
        const currentRange = rightScale.getVisibleRange();
        if (currentRange) {
          dragMode = 'price';
          rightScale.setAutoScale(false);
          dragStartPriceRange = currentRange;
        } else {
          dragMode = null;
        }
      } else if (y >= rect.height - TIME_AXIS_HEIGHT) {
        dragMode = 'time';
        dragStartLogicalRange = timeScale.getVisibleLogicalRange();
      } else {
        dragMode = null;
      }
      dragStart = { x, y };
    }

    function handleTouchMove(event: TouchEvent) {
      const touch = event.touches[0];
      if (!touch || !dragMode || !dragStart) return;
      const rect = container!.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (dragMode === 'price' && dragStartPriceRange) {
        const deltaY = y - dragStart.y;
        const scale = 1 + deltaY / rect.height;
        const mid = (dragStartPriceRange.from + dragStartPriceRange.to) / 2;
        const halfSpan = ((dragStartPriceRange.to - dragStartPriceRange.from) / 2) * scale;
        rightScale.setVisibleRange({ from: mid - halfSpan, to: mid + halfSpan });
      } else if (dragMode === 'time' && dragStartLogicalRange) {
        const deltaX = x - dragStart.x;
        const scale = 1 + deltaX / rect.width;
        const mid = (dragStartLogicalRange.from + dragStartLogicalRange.to) / 2;
        const halfSpan = ((dragStartLogicalRange.to - dragStartLogicalRange.from) / 2) * scale;
        timeScale.setVisibleLogicalRange({ from: mid - halfSpan, to: mid + halfSpan });
      }
    }

    function handleTouchEnd() {
      dragMode = null;
      dragStart = null;
      dragStartPriceRange = null;
      dragStartLogicalRange = null;
    }

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove);
    container.addEventListener('touchend', handleTouchEnd);

    const themeObserver = new MutationObserver(() => {
      chart.applyOptions(themeOptions(isDarkMode()));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      timeScale.unsubscribeVisibleLogicalRangeChange(computeArrows);
      themeObserver.disconnect();
      chart.remove();
    };
  }, [history, trades, avgCost, onPointSelect]);

  function selectArrowGroup(time: string, side: Trade['side']) {
    const match = trades.find((t) => t.side === side && t.datetime?.slice(0, 10) === time);
    if (match) onPointSelect(match);
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} data-testid="price-chart" style={{ width: '100%', overflowX: 'auto' }} />
      <div
        data-testid="ma-legend"
        style={{ position: 'absolute', top: 4, right: 4, fontSize: '0.65rem', textAlign: 'right', pointerEvents: 'none' }}
      >
        {legend.map((entry) => (
          <div key={entry.label} style={{ color: entry.color }}>
            {entry.label} {entry.value}
          </div>
        ))}
      </div>
      <div data-testid="trade-arrow-lane" style={{ position: 'relative', height: 20 }}>
        {arrows.map((arrow) => (
          <button
            key={`${arrow.time}-${arrow.side}`}
            type="button"
            onClick={() => selectArrowGroup(arrow.time, arrow.side)}
            aria-label={`${arrow.side === 'buy' ? '매수' : '매도'} ${arrow.time}`}
            style={{
              position: 'absolute',
              left: arrow.x + arrow.offsetX,
              transform: 'translateX(-50%)',
              color: ARROW_COLOR[arrow.side],
              fontSize: '0.7rem',
              lineHeight: 1,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {arrow.side === 'buy' ? '▲' : '▼'}
            {arrow.count > 1 ? ` ×${arrow.count}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
