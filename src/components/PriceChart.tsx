import { useEffect, useRef } from 'react';
import { createChart, LineStyle, type IChartApi } from 'lightweight-charts';
import type { HistoryBar } from '../api/quotes';
import type { Trade } from '../types';
import { simpleMovingAverage } from '../lib/movingAverage';

interface PriceChartProps {
  history: HistoryBar[];
  trades: Trade[];
  avgCost: number;
  onPointSelect: (trade: Trade) => void;
}

export function PriceChart({ history, trades, avgCost, onPointSelect }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth,
      height: 300,
      handleScroll: { horzTouchDrag: true },
    });

    const priceSeries = chart.addLineSeries({ color: '#2563eb' });
    priceSeries.setData(history.map((bar) => ({ time: bar.date, value: bar.close })));

    const closeValues = history.map((bar) => bar.close);
    // ADR-0008: MA cap expanded from 1~2 (20/60일) to 5 (5/20/50/100/200일); 20일·200일 emphasized (lineWidth 3 vs 1).
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4 }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1 },
      { window: 20, color: '#f59e0b', lineWidth: 3 },
      { window: 50, color: '#10b981', lineWidth: 1 },
      { window: 100, color: '#6366f1', lineWidth: 1 },
      { window: 200, color: '#dc2626', lineWidth: 3 },
    ];
    for (const ma of MOVING_AVERAGES) {
      const series = chart.addLineSeries({ color: ma.color, lineWidth: ma.lineWidth });
      series.setData(
        simpleMovingAverage(closeValues, ma.window)
          .map((value, i) => ({ time: history[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
    }

    const avgCostSeries = chart.addLineSeries({ color: '#ea580c', lineStyle: LineStyle.Dashed });
    if (history.length > 0) {
      avgCostSeries.setData([
        { time: history[0].date, value: avgCost },
        { time: history[history.length - 1].date, value: avgCost },
      ]);
    }

    priceSeries.setMarkers(
      trades
        .filter((t) => t.datetime)
        .map((t) => ({
          time: (t.datetime as string).slice(0, 10),
          position: t.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          color: t.side === 'buy' ? '#2563eb' : '#dc2626',
          shape: t.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
        }))
    );

    chart.subscribeClick((param) => {
      if (!param.time) return;
      const clicked = trades.find((t) => t.datetime?.slice(0, 10) === param.time);
      if (clicked) onPointSelect(clicked);
    });

    return () => chart.remove();
  }, [history, trades, avgCost, onPointSelect]);

  return <div ref={containerRef} data-testid="price-chart" style={{ width: '100%', overflowX: 'auto' }} />;
}
