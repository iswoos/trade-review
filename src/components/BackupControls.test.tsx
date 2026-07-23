import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IDBPDatabase } from 'idb';
import { openTradeReviewDB, type TradeReviewDB } from '../db/schema';
import { createTrade } from '../db/trades';
import { listAllTrades } from '../db/allTrades';
import { BackupControls } from './BackupControls';

let db: IDBPDatabase<TradeReviewDB>;

beforeEach(async () => {
  const deleteRequest = indexedDB.deleteDatabase('trade-review');
  await new Promise<void>((resolve, reject) => {
    deleteRequest.onsuccess = () => resolve();
    deleteRequest.onerror = () => reject(deleteRequest.error);
  });
  db = await openTradeReviewDB();
  URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
}, 30000);

afterEach(() => {
  db.close();
});

describe('BackupControls', () => {
  it('exports every stored trade as a downloadable CSV', async () => {
    await createTrade(db, {
      ticker: 'JOBY', market: 'US', name: '조비', currency: 'USD',
      datetime: '2025-07-10T00:00:00.000Z', datetimeUnknown: false, side: 'buy',
      price: 11.36, quantityType: 'shares', quantityValue: 100,
      fxRateAtTrade: null, rationaleTagIds: [], conviction: null, memo: '', attachment: null,
    });
    render(<BackupControls db={db} onImported={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '내보내기 (CSV)' }));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('imports a CSV file and calls onImported', async () => {
    const onImported = vi.fn();
    render(<BackupControls db={db} onImported={onImported} />);

    const csv =
      'id,ticker,market,name,currency,datetime,datetimeUnknown,side,price,quantityType,quantityValue,quantity,fxRateAtTrade,rationaleTagIds,conviction,memo,attachment,recordedAt\n' +
      'x1,JOBY,US,조비,USD,2025-07-10T00:00:00.000Z,false,buy,11.36,shares,100,100,,,,,,2025-07-10T00:05:00.000Z';
    const file = new File([csv], 'trades.csv', { type: 'text/csv' });

    await userEvent.upload(screen.getByLabelText('CSV 가져오기'), file);

    // Wait for async FileReader to complete
    await vi.waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    const restored = await listAllTrades(db);
    expect(restored).toHaveLength(1);
    expect(restored[0].ticker).toBe('JOBY');
  });
});
