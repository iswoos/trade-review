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

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

export function csvToTrades(csv: string): Trade[] {
  const lines = csv.split('\n').filter((line) => line.trim().length > 0);
  const [, ...dataLines] = lines;
  return dataLines.map((line) => {
    const fields = parseCsvLine(line);
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
