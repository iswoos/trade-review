import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import { TickerSearch } from './TickerSearch';
import { BackupControls } from './BackupControls';
import { sortPositionItems, type PositionListItem, type SortOrder } from '../lib/positionNav';

interface HomeScreenProps {
  db: IDBPDatabase<TradeReviewDB>;
  positions: PositionListItem[];
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  onSelectTicker: (ticker: string, name: string) => void;
  onImported: () => void;
}

const SORT_LABELS: Record<SortOrder, string> = {
  recent: '최근 매매순',
  alphabetical: '이름순',
  pnl: '평가손익순',
};

export function HomeScreen({ db, positions, sortOrder, onSortOrderChange, onSelectTicker, onImported }: HomeScreenProps) {
  const sorted = sortPositionItems(positions, sortOrder);

  return (
    <div>
      <div>
        <TickerSearch positions={positions} onSelectTicker={onSelectTicker} />
        <BackupControls db={db} onImported={onImported} />
      </div>

      <div>
        <h2>보유 포지션</h2>
        <label>
          정렬 기준
          <select
            aria-label="정렬 기준"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
          >
            {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
              <option key={order} value={order}>
                {SORT_LABELS[order]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul aria-label="보유 포지션 목록">
        {sorted.map((item) => {
          const pnlPercent =
            item.currentPrice != null && item.avgCost > 0
              ? ((item.currentPrice - item.avgCost) / item.avgCost) * 100
              : null;
          return (
            <li key={item.ticker}>
              <button type="button" onClick={() => onSelectTicker(item.ticker, item.name)}>
                <span>{item.ticker}</span>
                <span>{item.name}</span>
                <span>평단 {item.avgCost}</span>
                {item.currentPrice != null && <span>현재가 {item.currentPrice}</span>}
                {pnlPercent != null && (
                  <span>
                    {pnlPercent >= 0 ? '+' : ''}
                    {pnlPercent.toFixed(1)}%
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
