import { useState, useMemo } from 'react';
import type { Trade } from '../types';

interface TradeCalendarProps {
  trades: Trade[];
  onSelect: (trade: Trade) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function TradeCalendar({ trades, onSelect }: TradeCalendarProps) {
  // Determine initial month based on latest trade or current date
  const latestTradeDate = useMemo(() => {
    const sorted = [...trades].sort((a, b) => (b.datetime ?? '').localeCompare(a.datetime ?? ''));
    return sorted[0]?.datetime ? new Date(sorted[0].datetime) : new Date();
  }, [trades]);

  const [currentYear, setCurrentYear] = useState(latestTradeDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(latestTradeDate.getMonth()); // 0-indexed

  // Map trades by YYYY-MM-DD
  const tradesByDate = useMemo(() => {
    const map = new Map<string, Trade[]>();
    for (const t of trades) {
      if (!t.datetime) continue;
      const dateKey = t.datetime.slice(0, 10);
      const list = map.get(dateKey) ?? [];
      list.push(t);
      map.set(dateKey, list);
    }
    return map;
  }, [trades]);

  // Calendar grid computation
  const daysGrid = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();

    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevDate = new Date(currentYear, currentMonth - 1, dayNum);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      cells.push({ dateStr: `${y}-${m}-${d}`, dayNum, isCurrentMonth: false });
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const m = String(currentMonth + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      cells.push({ dateStr: `${currentYear}-${m}-${d}`, dayNum, isCurrentMonth: true });
    }

    // Next month padding to fill complete weeks
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextDate = new Date(currentYear, currentMonth + 1, dayNum);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, '0');
      const d = String(dayNum).padStart(2, '0');
      cells.push({ dateStr: `${y}-${m}-${d}`, dayNum, isCurrentMonth: false });
    }

    return cells;
  }, [currentYear, currentMonth]);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Month Navigation Header */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="이전 달"
          onClick={prevMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ‹
        </button>
        <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">
          {currentYear}년 {currentMonth + 1}월
        </span>
        <button
          type="button"
          aria-label="다음 달"
          onClick={nextMonth}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ›
        </button>
      </div>

      {/* Weekday Header */}
      <div className="mb-1.5 grid grid-cols-7 text-center text-[0.68rem] font-bold text-zinc-400">
        {WEEKDAYS.map((wd, i) => (
          <span key={wd} className={i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : ''}>
            {wd}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {daysGrid.map((cell, idx) => {
          const list = tradesByDate.get(cell.dateStr) ?? [];
          const buyCount = list.filter((t) => t.side === 'buy').length;
          const sellCount = list.filter((t) => t.side === 'sell').length;
          const noteCount = list.filter((t) => t.side === 'note').length;
          const hasRecord = list.length > 0;

          const isSunday = idx % 7 === 0;
          const isSaturday = idx % 7 === 6;

          return (
            <button
              key={cell.dateStr + idx}
              type="button"
              disabled={!hasRecord}
              onClick={() => hasRecord && onSelect(list[0])}
              aria-label={`${cell.dateStr} ${hasRecord ? `기록 ${list.length}건` : '기록 없음'}`}
              className={[
                'flex flex-col items-center justify-between min-h-[48px] p-1 rounded-xl border transition text-xs font-mono',
                !cell.isCurrentMonth
                  ? 'opacity-25 border-transparent'
                  : hasRecord
                  ? 'border-zinc-300 bg-zinc-50 shadow-xs hover:border-zinc-400 active:scale-95 dark:border-zinc-700 dark:bg-zinc-800/80 cursor-pointer'
                  : 'border-transparent text-zinc-700 dark:text-zinc-300 cursor-default',
              ].join(' ')}
            >
              <span
                className={[
                  'text-[0.7rem] font-bold',
                  isSunday ? 'text-rose-500' : isSaturday ? 'text-blue-500' : '',
                ].join(' ')}
              >
                {cell.dayNum}
              </span>

              {/* Badges for trades */}
              {hasRecord && (
                <div className="flex flex-wrap items-center justify-center gap-0.5 mt-0.5 text-[0.58rem] font-black leading-none">
                  {buyCount > 0 && <span className="text-rose-500">🔴{buyCount > 1 ? buyCount : ''}</span>}
                  {sellCount > 0 && <span className="text-blue-500">🔵{sellCount > 1 ? sellCount : ''}</span>}
                  {noteCount > 0 && <span className="text-amber-500">📝{noteCount > 1 ? noteCount : ''}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
