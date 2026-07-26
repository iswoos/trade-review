import { useEffect, useMemo, useRef, useState } from 'react';
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
import { aggregateBars, bucketKey, type AggregationPeriod } from '../lib/aggregateBars';

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

const ARROW_COLOR: Record<Trade['side'], string> = { buy: '#dc2626', sell: '#2563eb', note: '#d97706' };
// When a date has multiple sides, nudge each arrow off-center so they
// sit side by side instead of overlapping at the exact same x-coordinate.
const BOTH_SIDES_OFFSET = 8;

const PERIOD_LABELS: Record<AggregationPeriod, string> = { day: '일', week: '주', month: '월', year: '년' };

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
  const [period, setPeriod] = useState<AggregationPeriod>('day');
  // Visible chart date range (YYYY-MM-DD strings) — updated on every scroll/zoom
  const [visibleDateRange, setVisibleDateRange] = useState<{ from: string; to: string } | null>(null);
  // Ref for the chip scroll container — used to auto-scroll to first active chip
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [ohlc, setOhlc] = useState<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    changePercent: number;
  } | null>(null);

  const bucketDateByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const bar of history) {
      const key = bucketKey(bar.date, period);
      if (!map.has(key)) map.set(key, bar.date);
    }
    return map;
  }, [history, period]);

  function bucketDateForTrade(tradeDate: string): string {
    const bucket = bucketDateByKey.get(bucketKey(tradeDate, period));
    if (bucket) return bucket;
    // Fallback for future dates or dates outside stock history bounds
    return tradeDate;
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const aggregated = aggregateBars(history, period);

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
      aggregated.map((bar) => ({ time: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close }))
    );

    // Render candle markers for trade/note events
    const markers: {
      time: string;
      position: 'belowBar' | 'aboveBar';
      color: string;
      shape: 'arrowUp' | 'arrowDown' | 'square';
      text: string;
    }[] = [];

    const dateTradeMap = new Map<string, Trade[]>();
    for (const t of trades) {
      if (!t.datetime) continue;
      const bDate = bucketDateForTrade(t.datetime.slice(0, 10));
      if (!bDate) continue;
      const list = dateTradeMap.get(bDate) ?? [];
      list.push(t);
      dateTradeMap.set(bDate, list);
    }

    for (const [bDate, list] of dateTradeMap) {
      for (const t of list) {
        if (t.side === 'buy') {
          markers.push({
            time: bDate,
            position: 'belowBar',
            color: '#dc2626',
            shape: 'arrowUp',
            text: `매수 ${t.quantity}주`,
          });
        } else if (t.side === 'sell') {
          markers.push({
            time: bDate,
            position: 'aboveBar',
            color: '#2563eb',
            shape: 'arrowDown',
            text: `매도 ${t.quantity}주`,
          });
        } else {
          markers.push({
            time: bDate,
            position: 'aboveBar',
            color: '#d97706',
            shape: 'square',
            text: `📝 ${t.memo ? t.memo.slice(0, 6) : '메모'}`,
          });
        }
      }
    }
    (candleSeries as any).setMarkers?.(markers);

    chart.subscribeCrosshairMove?.((param) => {
      if (!param.time || !param.seriesData) {
        setOhlc(null);
        return;
      }
      const data = param.seriesData.get(candleSeries) as { open?: number; high?: number; low?: number; close?: number } | undefined;
      if (data && data.open != null && data.high != null && data.low != null && data.close != null) {
        const changePercent = ((data.close - data.open) / data.open) * 100;
        setOhlc({
          date: String(param.time),
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          changePercent,
        });
      } else {
        setOhlc(null);
      }
    });

    chart.subscribeClick?.((param) => {
      if (!param.time) return;
      const dateStr = String(param.time);
      const match = trades.find(
        (t) => t.datetime != null && bucketDateForTrade(t.datetime.slice(0, 10)) === dateStr
      );
      if (match) {
        onPointSelect(match);
      }
    });

    const closeValues = aggregated.map((bar) => bar.close);
    const MOVING_AVERAGES: { window: number; color: string; lineWidth: 1 | 2 | 3 | 4 }[] = [
      { window: 5, color: '#94a3b8', lineWidth: 1 },
      { window: 20, color: '#f59e0b', lineWidth: 3 },
      { window: 50, color: '#8b5cf6', lineWidth: 1 },
      { window: 100, color: '#6366f1', lineWidth: 1 },
      { window: 200, color: '#0d9488', lineWidth: 3 },
    ];
    const legendEntries: { label: string; color: string; value: number }[] = [];
    for (const ma of MOVING_AVERAGES) {
      const series = chart.addSeries(LineSeries, { color: ma.color, lineWidth: ma.lineWidth, lastValueVisible: false });
      const maValues = simpleMovingAverage(closeValues, ma.window);
      series.setData(
        maValues
          .map((value, i) => ({ time: aggregated[i].date, value }))
          .filter((point): point is { time: string; value: number } => point.value != null)
      );
      const latest = [...maValues].reverse().find((value): value is number => value != null);
      if (latest != null) {
        legendEntries.push({ label: `${ma.window}${PERIOD_LABELS[period]}`, color: ma.color, value: latest });
      }
    }
    setLegend(legendEntries);

    if (avgCost != null && aggregated.length > 0) {
      const avgCostSeries = chart.addSeries(LineSeries, {
        color: '#ea580c',
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
      });
      avgCostSeries.setData([
        { time: aggregated[0].date, value: avgCost },
        { time: aggregated[aggregated.length - 1].date, value: avgCost },
      ]);
    }

    const rightScale = chart.priceScale('right');
    const timeScale = chart.timeScale();
    const TIME_AXIS_HEIGHT = 28;

    function computeArrowsAndVisibleRange() {
      const groups = new Map<string, { buy: number; sell: number; note: number }>();
      for (const t of trades) {
        if (!t.datetime) continue;
        const time = bucketDateForTrade(t.datetime.slice(0, 10));
        if (!time) continue;
        const g = groups.get(time) ?? { buy: 0, sell: 0, note: 0 };
        g[t.side] += 1;
        groups.set(time, g);
      }
      const next: TradeArrow[] = [];
      for (const [time, g] of groups) {
        const x = timeScale.timeToCoordinate(time);
        if (x == null) continue;
        const countSides = (g.buy > 0 ? 1 : 0) + (g.sell > 0 ? 1 : 0) + (g.note > 0 ? 1 : 0);
        const multi = countSides > 1;
        if (g.buy > 0) {
          next.push({ time, side: 'buy', count: g.buy, x, offsetX: multi ? -BOTH_SIDES_OFFSET : 0 });
        }
        if (g.sell > 0) {
          next.push({ time, side: 'sell', count: g.sell, x, offsetX: multi ? BOTH_SIDES_OFFSET : 0 });
        }
        if (g.note > 0) {
          next.push({ time, side: 'note', count: g.note, x, offsetX: multi ? BOTH_SIDES_OFFSET * 2 : 0 });
        }
      }
      setArrows(next);

      // Update visible date range from logical range → aggregated bar dates
      const logicalRange = timeScale.getVisibleLogicalRange();
      if (logicalRange && aggregated.length > 0) {
        const fromIdx = Math.max(0, Math.floor(logicalRange.from));
        const toIdx = Math.min(aggregated.length - 1, Math.ceil(logicalRange.to));
        setVisibleDateRange({
          from: aggregated[fromIdx]?.date ?? aggregated[0].date,
          to: aggregated[toIdx]?.date ?? aggregated[aggregated.length - 1].date,
        });
      } else if (aggregated.length > 0) {
        setVisibleDateRange({
          from: aggregated[0].date,
          to: aggregated[aggregated.length - 1].date,
        });
      }
    }
    computeArrowsAndVisibleRange();
    timeScale.subscribeVisibleLogicalRangeChange(computeArrowsAndVisibleRange);

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
      if (dragMode && event.cancelable) {
        event.preventDefault();
      }
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

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    const themeObserver = new MutationObserver(() => {
      chart.applyOptions(themeOptions(isDarkMode()));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      timeScale.unsubscribeVisibleLogicalRangeChange(computeArrowsAndVisibleRange);
      themeObserver.disconnect();
      chart.remove();
    };
  }, [history, trades, avgCost, onPointSelect, period]);

  function selectArrowGroup(time: string, side: Trade['side']) {
    const match = trades.find(
      (t) => t.side === side && t.datetime != null && bucketDateForTrade(t.datetime.slice(0, 10)) === time
    );
    if (match) onPointSelect(match);
  }

  // Find all trades/memos matching current hovered date
  const hoveredTrades = useMemo(() => {
    if (!ohlc?.date) return [];
    return trades.filter(
      (t) => t.datetime != null && bucketDateForTrade(t.datetime.slice(0, 10)) === ohlc.date
    );
  }, [ohlc?.date, trades, bucketDateForTrade]);

  // Group all trades by bucketed date for lower action chips
  const dateTradeSummary = useMemo(() => {
    const map = new Map<string, { time: string; buy: number; sell: number; note: number; firstTrade: Trade }>();
    for (const t of trades) {
      if (!t.datetime) continue;
      const bDate = bucketDateForTrade(t.datetime.slice(0, 10));
      if (!bDate) continue;
      const existing = map.get(bDate) ?? { time: bDate, buy: 0, sell: 0, note: 0, firstTrade: t };
      if (t.side === 'buy') existing.buy += 1;
      else if (t.side === 'sell') existing.sell += 1;
      else existing.note += 1;
      map.set(bDate, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.time.localeCompare(b.time));
  }, [trades, bucketDateForTrade]);

  // Derive which chips are in the current viewport (for visual highlight)
  const isChipActive = (time: string): boolean => {
    if (!visibleDateRange) return true;
    return time >= visibleDateRange.from && time <= visibleDateRange.to;
  };

  // Auto-scroll chip bar to first active chip when viewport changes
  useEffect(() => {
    const container = chipScrollRef.current;
    if (!container || !visibleDateRange) return;
    const firstActive = container.querySelector<HTMLElement>('[data-active="true"]');
    if (firstActive && typeof container.scrollBy === 'function') {
      const containerLeft = container.getBoundingClientRect().left;
      const chipLeft = firstActive.getBoundingClientRect().left;
      container.scrollBy({ left: chipLeft - containerLeft - 8, behavior: 'smooth' });
    }
  }, [visibleDateRange]);

  /** Human-readable chip label depending on current period */
  function chipLabel(bDate: string): string {
    if (period === 'year') {
      // bDate is YYYY-MM-DD (first trading day of the year) → show '2026년'
      return `${bDate.slice(0, 4)}년`;
    }
    if (period === 'month') {
      // bDate is YYYY-MM-DD (first trading day of the month) → show '07월'
      return `${bDate.slice(5, 7)}월`;
    }
    // day / week: show MM-DD
    return bDate.length > 7 ? bDate.slice(5) : bDate;
  }

  return (
    <div>
      <div role="radiogroup" aria-label="봉 단위" className="mb-2 flex gap-2">
        {(Object.keys(PERIOD_LABELS) as AggregationPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => setPeriod(p)}
            className={
              period === p
                ? 'flex-1 rounded-xl bg-zinc-900 py-1.5 text-xs font-bold text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'flex-1 rounded-xl border border-zinc-200 py-1.5 text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300'
            }
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Horizontal Slim Indicator Legend Bar */}
      <div
        data-testid="ma-legend"
        className="mb-1.5 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-1 px-1.5 text-[0.68rem] text-zinc-600 dark:text-zinc-300 scrollbar-none"
      >
        {legend.map((entry) => (
          <span
            key={entry.label}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 font-semibold dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60"
            style={{ color: entry.color }}
          >
            {entry.label} {entry.value.toLocaleString()}
          </span>
        ))}
      </div>

      {/* Crosshair OHLCV & Multi Trade/Memo Tooltip Bar */}
      {ohlc && (
        <div className="mb-2 flex flex-col gap-1.5 rounded-xl bg-zinc-100/90 p-2.5 text-[0.7rem] font-semibold text-zinc-700 dark:bg-zinc-800/90 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60">
          <div className="flex items-center justify-between border-b border-zinc-200/60 pb-1.5 dark:border-zinc-700/60">
            <span className="font-extrabold text-zinc-900 dark:text-zinc-100 text-xs">{ohlc.date}</span>
            <span className={ohlc.changePercent >= 0 ? 'font-mono font-bold text-rose-500' : 'font-mono font-bold text-blue-500'}>
              {ohlc.changePercent >= 0 ? '+' : ''}{ohlc.changePercent.toFixed(2)}%
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.68rem]">
            <span>시 <span className="font-bold text-zinc-900 dark:text-zinc-100">{ohlc.open.toLocaleString()}</span></span>
            <span>고 <span className="font-bold text-rose-500">{ohlc.high.toLocaleString()}</span></span>
            <span>저 <span className="font-bold text-blue-500">{ohlc.low.toLocaleString()}</span></span>
            <span>종 <span className="font-bold text-zinc-900 dark:text-zinc-100">{ohlc.close.toLocaleString()}</span></span>
          </div>

          {hoveredTrades.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-zinc-200/60 pt-1.5 dark:border-zinc-700/60">
              <span className="text-[0.63rem] font-bold text-zinc-400 dark:text-zinc-500">기록 목록 (클릭시 상세보기)</span>
              <div className="flex flex-wrap gap-1.5">
                {hoveredTrades.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onPointSelect(t)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-white px-2 py-1 text-[0.68rem] font-bold shadow-sm transition hover:bg-zinc-50 active:scale-95 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <span
                      className={`rounded px-1 py-0.2 text-[0.6rem] font-black text-white ${
                        t.side === 'note' ? 'bg-amber-600' : t.side === 'buy' ? 'bg-buy' : 'bg-sell'
                      }`}
                    >
                      {t.side === 'note' ? '📝 메모' : t.side === 'buy' ? '🔴 매수' : '🔵 매도'}
                    </span>
                    {t.side !== 'note' && (
                      <span className="font-mono text-zinc-900 dark:text-zinc-100">
                        {t.quantity}주 ({t.price.toLocaleString()}원)
                      </span>
                    )}
                    {t.memo && (
                      <span className="max-w-[100px] truncate italic text-zinc-500 dark:text-zinc-400">
                        "{t.memo}"
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          data-testid="price-chart"
          style={{ width: '100%', overflowX: 'auto', touchAction: 'none' }}
        />

        {/* Date Trade Chips Lane — all chips, active ones highlighted, inactive dimmed */}
        <div data-testid="trade-arrow-lane" className="mt-2 py-1">
          {dateTradeSummary.length > 0 ? (
            <div
              ref={chipScrollRef}
              className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none"
            >
              {dateTradeSummary.map((item) => {
                const active = isChipActive(item.time);
                return (
                  <button
                    key={item.time}
                    type="button"
                    data-active={active}
                    onClick={() => onPointSelect(item.firstTrade)}
                    aria-label={`${item.buy > 0 ? '매수 ' : item.sell > 0 ? '매도 ' : '메모 '}${item.time}`}
                    className={[
                      'inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[0.68rem] font-bold transition-all duration-200',
                      active
                        ? 'border border-zinc-300 bg-white shadow-sm text-zinc-800 active:scale-95 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                        : 'border border-zinc-200/50 bg-zinc-50/50 text-zinc-400 opacity-40 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-500',
                    ].join(' ')}
                  >
                    <span className="font-mono">{chipLabel(item.time)}</span>
                    {item.buy > 0 && (
                      <span className={active ? 'text-rose-500' : 'text-zinc-400'}>
                        🔴{item.buy > 1 ? item.buy : ''}
                      </span>
                    )}
                    {item.sell > 0 && (
                      <span className={active ? 'text-blue-500' : 'text-zinc-400'}>
                        🔵{item.sell > 1 ? item.sell : ''}
                      </span>
                    )}
                    {item.note > 0 && (
                      <span className={active ? 'text-amber-500' : 'text-zinc-400'}>
                        📝{item.note > 1 ? item.note : ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
