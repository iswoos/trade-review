import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
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
      const series = chart.addSeries(LineSeries, { color: ma.color, lineWidth: ma.lineWidth });
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
      const avgCostSeries = chart.addSeries(LineSeries, { color: '#ea580c', lineStyle: LineStyle.Dashed });
      avgCostSeries.setData([
        { time: history[0].date, value: avgCost },
        { time: history[history.length - 1].date, value: avgCost },
      ]);
    }

    createSeriesMarkers(
      candleSeries,
      trades
        .filter((t) => t.datetime)
        .map((t) => ({
          time: (t.datetime as string).slice(0, 10),
          position: t.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.side === 'buy' ? '#10b981' : '#a855f7',
          shape: 'circle' as const,
          size: 2,
        }))
    );

    const rightScale = chart.priceScale('right');
    const timeScale = chart.timeScale();
    const TIME_AXIS_HEIGHT = 28;

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

    chart.subscribeClick((param) => {
      if (!param.time) return;
      const clicked = trades.find((t) => t.datetime?.slice(0, 10) === param.time);
      if (clicked) onPointSelect(clicked);
    });

    const themeObserver = new MutationObserver(() => {
      chart.applyOptions(themeOptions(isDarkMode()));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      themeObserver.disconnect();
      chart.remove();
    };
  }, [history, trades, avgCost, onPointSelect]);

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
    </div>
  );
}
