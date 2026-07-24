import type { IDBPDatabase } from 'idb';
import type { TradeReviewDB } from '../db/schema';
import { listAllTrades, putAllTrades } from '../db/allTrades';
import { tradesToCsv, csvToTrades } from '../lib/csv';

interface BackupControlsProps {
  db: IDBPDatabase<TradeReviewDB>;
  onImported: () => void;
}

export function BackupControls({ db, onImported }: BackupControlsProps) {
  async function handleExport() {
    const trades = await listAllTrades(db);
    const csv = tradesToCsv(trades);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'trade-review-backup.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    const trades = csvToTrades(text);
    await putAllTrades(db, trades);
    onImported();
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <button type="button" onClick={handleExport} className="rounded-xl px-2 py-1 text-zinc-500 dark:text-zinc-400">
        내보내기 (CSV)
      </button>
      <label className="rounded-xl px-2 py-1 text-zinc-500 dark:text-zinc-400">
        CSV 가져오기
        <input type="file" accept=".csv" aria-label="CSV 가져오기" onChange={handleImport} className="hidden" />
      </label>
    </div>
  );
}
