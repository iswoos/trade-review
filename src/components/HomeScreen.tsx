import { TickerSearch } from './TickerSearch';
import { ThemeToggle } from './ThemeToggle';
import {
  sortPositionItems,
  calculatePortfolioTotal,
  dailyChangeAmount,
  type PositionListItem,
  type SortOrder,
} from '../lib/positionNav';

interface HomeScreenProps {
  positions: PositionListItem[];
  usdKrwRate: number | null;
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onSelectTicker: (ticker: string, name: string) => void;
  onOpenTagManagement: () => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: '최근 매매순',
  alphabetical: '이름순',
  pnl: '평가손익순',
};

function pnlColor(isLoss: boolean, isProfit: boolean): string {
  if (isLoss) return 'text-blue-600 dark:text-blue-400';
  if (isProfit) return 'text-rose-600 dark:text-rose-400';
  return 'text-zinc-500 dark:text-zinc-400';
}

function PositionRow({
  item,
  usdKrwRate,
  portfolioTotalEvaluation,
  onSelectTicker,
}: {
  item: PositionListItem;
  usdKrwRate: number | null;
  portfolioTotalEvaluation: number | null;
  onSelectTicker: (ticker: string, name: string) => void;
}) {
  const isUSD = item.currency === 'USD';
  // 평단가/현재가는 종목이 실제 거래되는 통화 그대로 보여준다(ADR-0001).
  // 반면 매입금액/평가금액/평가손익 같은 금액은 원화로 환산해서 보여주는 게
  // 원화 위주로 자산을 파악하는 데 더 유용하므로, 달러 포지션은 당일 환율로
  // 환산한다(ADR-0001이 명시적으로 허용하는 "화면 표시 시점 환산"). 환율을
  // 못 구했을 때만 원래 통화(달러) 그대로 보여준다.
  const amountRate = isUSD ? usdKrwRate ?? 1 : 1;
  const amountCurrencyLabel = isUSD && usdKrwRate == null ? '$' : '원';
  const perShareCurrencyLabel = isUSD ? '$' : '원';
  const includedInTotal = !isUSD || usdKrwRate != null;

  const totalQuantity = item.totalQuantity ?? 0;
  const totalInvested = item.avgCost * totalQuantity * amountRate;
  const totalEvaluation = item.currentPrice != null ? item.currentPrice * totalQuantity * amountRate : null;
  const rawPnl = totalEvaluation != null ? totalEvaluation - totalInvested : null;
  const pnlAmount = rawPnl != null ? (Math.abs(rawPnl) < 0.5 ? 0 : Math.round(rawPnl)) : null;

  const rawPnlPercent =
    item.currentPrice != null && item.avgCost > 0 ? ((item.currentPrice - item.avgCost) / item.avgCost) * 100 : null;
  const pnlPercent = rawPnlPercent != null ? (Math.abs(rawPnlPercent) < 0.05 ? 0 : rawPnlPercent) : null;
  const isLoss = pnlPercent != null && pnlPercent < 0;
  const isProfit = pnlPercent != null && pnlPercent > 0;

  const dailyChangePercent = item.dailyChangePercent ?? null;
  const dailyAmount =
    item.currentPrice != null && dailyChangePercent != null
      ? dailyChangeAmount(item.currentPrice, dailyChangePercent)
      : null;
  const isDailyLoss = dailyChangePercent != null && dailyChangePercent < 0;
  const isDailyProfit = dailyChangePercent != null && dailyChangePercent > 0;

  // 보유비중은 이 종목의 원화 환산 평가금액이 포트폴리오 총 평가금액에서 차지하는 비율.
  // usdKrwRate가 없어 이 종목이 총계 계산에서 빠졌을 땐(calculatePortfolioTotal과 동일한
  // 조건) 서로 다른 통화 스케일을 나누는 의미 없는 값이 되므로 표시하지 않는다.
  const weight =
    includedInTotal && totalEvaluation != null && portfolioTotalEvaluation != null && portfolioTotalEvaluation > 0
      ? (totalEvaluation / portfolioTotalEvaluation) * 100
      : null;

  const formattedQty = Number.isInteger(totalQuantity)
    ? totalQuantity.toLocaleString()
    : Number(totalQuantity.toFixed(2)).toLocaleString();

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onSelectTicker(item.ticker, item.name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectTicker(item.ticker, item.name);
        }
      }}
      className="cursor-pointer text-left transition active:scale-[0.99] focus:outline-none focus-visible:bg-zinc-50 dark:focus-visible:bg-zinc-800/60"
    >
      <td className="sticky left-0 z-10 border-r border-zinc-100 bg-white px-3 py-2.5 align-middle dark:border-zinc-800/60 dark:bg-zinc-900">
        <div className="text-sm font-black tracking-tight text-zinc-900 dark:text-zinc-50">{item.name || item.ticker}</div>
        <div className="text-[0.68rem] font-medium text-zinc-400 dark:text-zinc-500">
          {item.ticker} · {formattedQty}주
        </div>
        {(item.buyCnt > 0 || item.sellCnt > 0 || item.noteCnt > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {item.buyCnt > 0 && (
              <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-rose-500 dark:bg-rose-950/40 dark:text-rose-400">
                매수 {item.buyCnt}
              </span>
            )}
            {item.sellCnt > 0 && (
              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-blue-500 dark:bg-blue-950/40 dark:text-blue-400">
                매도 {item.sellCnt}
              </span>
            )}
            {item.noteCnt > 0 && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.6rem] font-semibold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                메모 {item.noteCnt}
              </span>
            )}
          </div>
        )}
      </td>

      {/* 현재가 · 평단가 */}
      <td className="px-3 py-2.5 text-right align-middle font-mono">
        {item.currentPrice != null ? (
          <>
            <div className="text-sm font-extrabold text-zinc-900 dark:text-zinc-50">
              {item.currentPrice.toLocaleString()}{' '}
              <span className="text-[0.6rem] font-normal text-zinc-400">{perShareCurrencyLabel}</span>
            </div>
            <div className="text-[0.68rem] font-semibold text-zinc-400 dark:text-zinc-500">
              평단 {item.avgCost.toLocaleString()}
            </div>
          </>
        ) : (
          <span className="text-zinc-400">-</span>
        )}
      </td>

      {/* 평가손익 · 수익률 */}
      <td className="px-3 py-2.5 text-right align-middle font-mono">
        {pnlAmount != null ? (
          <>
            <div className={`text-sm font-black ${pnlColor(isLoss, isProfit)}`}>
              {pnlAmount > 0 ? '+' : ''}
              {pnlAmount.toLocaleString()}
            </div>
            {pnlPercent != null && (
              <div className={`text-[0.68rem] font-bold ${pnlColor(isLoss, isProfit)}`}>
                {pnlPercent > 0 ? '+' : ''}
                {pnlPercent.toFixed(2)}%
              </div>
            )}
          </>
        ) : (
          <span className="text-zinc-400">-</span>
        )}
      </td>

      {/* 매입금액 · 평가금액 */}
      <td className="px-3 py-2.5 text-right align-middle font-mono">
        <div className="text-[0.72rem] font-bold text-zinc-700 dark:text-zinc-300">
          {totalInvested > 0 ? (
            <>
              {totalInvested.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="text-[0.6rem] font-normal text-zinc-400"> {amountCurrencyLabel}</span>
            </>
          ) : (
            '-'
          )}
        </div>
        <div
          className={`text-[0.68rem] font-bold ${
            totalEvaluation != null ? pnlColor(isLoss, isProfit) : 'text-zinc-400'
          }`}
        >
          {totalEvaluation != null
            ? totalEvaluation.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : '-'}
        </div>
      </td>

      {/* 전일대비 (변동액 + 등락률) */}
      <td className="px-3 py-2.5 text-right align-middle font-mono">
        {dailyChangePercent != null && dailyAmount != null ? (
          <>
            <div className={`text-[0.72rem] font-bold ${pnlColor(isDailyLoss, isDailyProfit)}`}>
              {dailyAmount > 0 ? '+' : ''}
              {dailyAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
            <div className={`text-[0.68rem] font-bold ${pnlColor(isDailyLoss, isDailyProfit)}`}>
              {dailyChangePercent > 0 ? '+' : ''}
              {dailyChangePercent.toFixed(2)}%
            </div>
          </>
        ) : (
          <span className="text-zinc-400">-</span>
        )}
      </td>

      {/* 보유비중 */}
      <td className="px-3 py-2.5 text-right align-middle font-mono">
        <span className="text-[0.72rem] font-bold text-zinc-600 dark:text-zinc-400">
          {weight != null ? `${weight.toFixed(1)}%` : '-'}
        </span>
      </td>
    </tr>
  );
}

// white-space는 상속 속성이라 <table>에 한 번만 nowrap을 걸어도 모든 셀에 전파된다
// (표가 짜부라지면서 "인터플렉스" 같은 종목명이나 "현재가 · 평단가" 헤더가 줄바꿈되는
// 문제 방지). 배경은 반드시 불투명해야 한다 - 반투명이면 sticky 종목명 열 밑으로
// 스크롤되어 사라져야 할 다른 헤더 텍스트가 비쳐 보인다.
const HEADER_CELL_BASE_CLASS =
  'whitespace-nowrap border-b border-zinc-100 px-3 py-2 text-right text-[0.63rem] font-bold uppercase tracking-wide text-zinc-400 dark:border-zinc-800/60 dark:text-zinc-500';
const HEADER_CELL_CLASS = `${HEADER_CELL_BASE_CLASS} bg-zinc-50/80 dark:bg-zinc-800/40`;
const STICKY_HEADER_CELL_CLASS = `sticky left-0 z-10 min-w-[112px] border-r bg-zinc-100 text-left dark:bg-zinc-800 ${HEADER_CELL_BASE_CLASS}`;

function PositionTable({
  title,
  items,
  usdKrwRate,
  portfolioTotalEvaluation,
  onSelectTicker,
}: {
  title: string;
  items: PositionListItem[];
  usdKrwRate: number | null;
  portfolioTotalEvaluation: number | null;
  onSelectTicker: (ticker: string, name: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="section-label px-1 pb-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {title}
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table
            aria-label={`${title} 목록`}
            className="min-w-full whitespace-nowrap border-collapse bg-white dark:bg-zinc-900"
          >
            <thead>
              <tr>
                <th className={STICKY_HEADER_CELL_CLASS}>종목명</th>
                <th className={`min-w-[96px] ${HEADER_CELL_CLASS}`}>현재가 · 평단가</th>
                <th className={`min-w-[92px] ${HEADER_CELL_CLASS}`}>평가손익 · 수익률</th>
                <th className={`min-w-[104px] ${HEADER_CELL_CLASS}`}>매입 · 평가금액</th>
                <th className={`min-w-[76px] ${HEADER_CELL_CLASS}`}>전일대비</th>
                <th className={`min-w-[64px] ${HEADER_CELL_CLASS}`}>보유비중</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {items.map((item) => (
                <PositionRow
                  key={item.ticker}
                  item={item}
                  usdKrwRate={usdKrwRate}
                  portfolioTotalEvaluation={portfolioTotalEvaluation}
                  onSelectTicker={onSelectTicker}
                />
              ))}
            </tbody>
          </table>
        </div>
        {/* 오른쪽에 더 스크롤할 열이 있다는 걸 알려주는 정적 힌트. 홈 화면은 하루에도
            여러 번 보는 화면이라 애니메이션 대신 고정된 그라데이션만 둔다. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white dark:from-zinc-900"
        />
      </div>
    </div>
  );
}

export function HomeScreen({ positions, usdKrwRate, sortOrder, onSortOrderChange, onSelectTicker, onOpenTagManagement }: HomeScreenProps) {
  const sorted = sortPositionItems(positions, sortOrder);
  const portfolioTotal = calculatePortfolioTotal(positions, usdKrwRate);
  const isTotalLoss = portfolioTotal != null && portfolioTotal.pnlAmount < 0;
  const isTotalProfit = portfolioTotal != null && portfolioTotal.pnlAmount > 0;
  const krPositions = sorted.filter((p) => p.currency !== 'USD');
  const usPositions = sorted.filter((p) => p.currency === 'USD');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        </div>
        <button
          type="button"
          onClick={onOpenTagManagement}
          aria-label="태그 관리"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          🏷️
        </button>
        <ThemeToggle />
      </div>

      {portfolioTotal != null && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500">포트폴리오 총계</span>
          <div className="mt-1.5 grid grid-cols-3 gap-2 text-[0.72rem]">
            <div className="flex flex-col">
              <span className="text-zinc-400 dark:text-zinc-500">매입금액</span>
              <span className="font-bold text-zinc-700 dark:text-zinc-300 font-mono">
                {Math.round(portfolioTotal.totalInvested).toLocaleString()}
                <span className="text-[0.65rem] font-normal text-zinc-400"> 원</span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-400 dark:text-zinc-500">평가금액</span>
              <span className={`font-bold font-mono ${pnlColor(isTotalLoss, isTotalProfit)}`}>
                {Math.round(portfolioTotal.totalEvaluation).toLocaleString()}
                <span className="text-[0.65rem] font-normal text-zinc-400"> 원</span>
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-zinc-400 dark:text-zinc-500">평가손익 (수익률)</span>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <span className={`font-black font-mono ${pnlColor(isTotalLoss, isTotalProfit)}`}>
                  {portfolioTotal.pnlAmount > 0 ? '+' : ''}
                  {Math.round(portfolioTotal.pnlAmount).toLocaleString()}
                </span>
                <span className={`text-[0.68rem] font-bold font-mono ${pnlColor(isTotalLoss, isTotalProfit)}`}>
                  ({portfolioTotal.pnlPercent > 0 ? '+' : ''}
                  {portfolioTotal.pnlPercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-50">보유 주식</h2>
        <label className="text-xs text-zinc-500 dark:text-zinc-400">
          정렬 기준
          <select
            aria-label="정렬 기준"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
            className="ml-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
              <option key={order} value={order}>
                {SORT_LABELS[order]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section aria-label="보유 주식 목록" className="flex flex-col gap-3">
        <PositionTable
          title="국내 주식"
          items={krPositions}
          usdKrwRate={usdKrwRate}
          portfolioTotalEvaluation={portfolioTotal?.totalEvaluation ?? null}
          onSelectTicker={onSelectTicker}
        />
        <PositionTable
          title="해외 주식"
          items={usPositions}
          usdKrwRate={usdKrwRate}
          portfolioTotalEvaluation={portfolioTotal?.totalEvaluation ?? null}
          onSelectTicker={onSelectTicker}
        />
      </section>

      <a
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noreferrer"
        className="text-center text-[0.65rem] text-zinc-400 dark:text-zinc-600"
      >
        Powered by TradingView Lightweight Charts
      </a>
    </div>
  );
}
