import type { Trade } from '../types';

const CSV_COLUMNS = [
  'id', 'ticker', 'market', 'name', 'currency', 'datetime', 'datetimeUnknown',
  'side', 'price', 'quantityType', 'quantityValue', 'quantity', 'fxRateAtTrade',
  'rationaleTagIds', 'conviction', 'memo', 'attachment', 'recordedAt',
] as const;

type Column = (typeof CSV_COLUMNS)[number];

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function fieldToString(trade: Trade, col: Column): string {
  const raw = trade[col];
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.join(';');
  return String(raw);
}

export function tradesToCsv(trades: Trade[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = trades.map((trade) =>
    CSV_COLUMNS.map((col) => escapeCsvField(fieldToString(trade, col))).join(',')
  );
  return [header, ...rows].join('\n');
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        // Any character inside quotes (including newlines)
        currentField += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // Field separator
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        // CRLF row separator (Windows)
        if (currentField.length > 0 || currentRow.length > 0) {
          currentRow.push(currentField);
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        }
        i++; // Skip the \n
      } else if (char === '\n') {
        // LF row separator (Unix)
        if (currentField.length > 0 || currentRow.length > 0) {
          currentRow.push(currentField);
          if (currentRow.length > 0) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        }
      } else {
        // Regular character
        currentField += char;
      }
    }
  }

  // Push the last field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
  }
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

export function csvToTrades(csv: string): Trade[] {
  const rows = parseCsvRows(csv);
  const [, ...dataRows] = rows;
  return dataRows.map((fields) => {
    const record: Record<Column, string> = {} as Record<Column, string>;
    CSV_COLUMNS.forEach((col, i) => {
      record[col] = fields[i] ?? '';
    });
    return {
      id: record.id,
      ticker: record.ticker,
      market: record.market as Trade['market'],
      name: record.name,
      currency: record.currency as Trade['currency'],
      datetime: record.datetime === '' ? null : record.datetime,
      datetimeUnknown: record.datetimeUnknown === 'true',
      side: record.side as Trade['side'],
      price: Number(record.price),
      quantityType: record.quantityType as Trade['quantityType'],
      quantityValue: Number(record.quantityValue),
      quantity: Number(record.quantity),
      fxRateAtTrade: record.fxRateAtTrade === '' ? null : Number(record.fxRateAtTrade),
      rationaleTagIds: record.rationaleTagIds === '' ? [] : record.rationaleTagIds.split(';'),
      conviction: record.conviction === '' ? null : Number(record.conviction),
      memo: record.memo,
      attachment: record.attachment === '' ? null : record.attachment,
      recordedAt: record.recordedAt,
    };
  });
}
