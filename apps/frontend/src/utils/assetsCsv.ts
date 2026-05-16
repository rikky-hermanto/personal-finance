import type { Account } from '@/types/Account';
import type { Asset } from '@/types/Asset';
import type { Holding } from '@/types/Holding';

// ── Template generation ──────────────────────────────────────────────────────

export interface TemplateCsvRow {
  subject_type: 'account' | 'asset' | 'holding';
  subject_id: string;
  name: string;
  category: string;
  currency: string;
  date: string;
  value_native: string;
  fx_rate_to_idr: string;
  notes: string;
}

const HEADERS: (keyof TemplateCsvRow)[] = [
  'subject_type', 'subject_id', 'name', 'category',
  'currency', 'date', 'value_native', 'fx_rate_to_idr', 'notes',
];

export function buildTemplateRows(
  accounts: Account[],
  assets: Asset[],
  holdings: Holding[],
): TemplateCsvRow[] {
  const today = new Date().toISOString().slice(0, 10);
  const rows: TemplateCsvRow[] = [];

  for (const acc of accounts) {
    rows.push({
      subject_type: 'account',
      subject_id: acc.id,
      name: acc.name,
      category: acc.accountType,
      currency: acc.currency,
      date: today,
      value_native: '',
      fx_rate_to_idr: acc.currency === 'IDR' ? '1' : '',
      notes: '',
    });
  }

  for (const asset of assets) {
    rows.push({
      subject_type: 'asset',
      subject_id: asset.id,
      name: asset.name,
      category: asset.assetClass,
      currency: asset.currency,
      date: today,
      value_native: '',
      fx_rate_to_idr: asset.currency === 'IDR' ? '1' : '',
      notes: '',
    });
  }

  for (const holding of holdings) {
    rows.push({
      subject_type: 'holding',
      subject_id: holding.id,
      name: holding.ticker,
      category: 'investment',
      currency: holding.currency,
      date: today,
      value_native: '',
      fx_rate_to_idr: holding.currency === 'IDR' ? '1' : '',
      notes: '',
    });
  }

  return rows;
}

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function rowsToCsv(rows: TemplateCsvRow[]): string {
  const header = HEADERS.join(',');
  const body = rows.map(row =>
    HEADERS.map(h => csvEscape(String(row[h]))).join(',')
  );
  return [header, ...body].join('\n');
}

export function downloadCsv(content: string, filename: string): void {
  const bom = '﻿'; // UTF-8 BOM so Excel opens it correctly
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Parsing (import) ─────────────────────────────────────────────────────────

export interface ParsedValuationRow {
  subjectType: 'account' | 'asset' | 'holding';
  subjectId: string;
  name: string;
  valueNative: number;
  currency: string;
  fxRateToIdr: number;
  valueIdr: number;
  valuedAt: string;
  notes?: string;
}

export interface ParseResult {
  rows: ParsedValuationRow[];
  errors: string[];
  skippedEmpty: number;
}

export function parseCsv(csvText: string): ParseResult {
  const lines = csvText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV has no data rows (only header or empty)'], skippedEmpty: 0 };
  }

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
  const errors: string[] = [];
  const rows: ParsedValuationRow[] = [];
  let skippedEmpty = 0;

  const col = (cols: string[], key: string) =>
    cols[headers.indexOf(key)]?.trim() ?? '';

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const valueNativeStr = col(cols, 'value_native');

    if (!valueNativeStr) {
      skippedEmpty++;
      continue;
    }

    const subjectType = col(cols, 'subject_type') as ParsedValuationRow['subjectType'];
    if (!['account', 'asset', 'holding'].includes(subjectType)) {
      errors.push(`Row ${i + 1}: unknown subject_type "${subjectType}" — must be account, asset, or holding`);
      continue;
    }

    const subjectId = col(cols, 'subject_id');
    if (!subjectId) {
      errors.push(`Row ${i + 1}: missing subject_id`);
      continue;
    }

    const valuedAt = col(cols, 'date');
    if (!valuedAt || !/^\d{4}-\d{2}-\d{2}$/.test(valuedAt)) {
      errors.push(`Row ${i + 1}: invalid date "${valuedAt}" — expected YYYY-MM-DD`);
      continue;
    }

    const valueNative = parseFloat(valueNativeStr.replace(/,/g, ''));
    if (isNaN(valueNative) || valueNative < 0) {
      errors.push(`Row ${i + 1}: invalid value_native "${valueNativeStr}"`);
      continue;
    }

    const fxRateStr = col(cols, 'fx_rate_to_idr');
    const fxRateToIdr = fxRateStr ? parseFloat(fxRateStr) : 1;
    if (isNaN(fxRateToIdr) || fxRateToIdr <= 0) {
      errors.push(`Row ${i + 1}: invalid fx_rate_to_idr "${fxRateStr}"`);
      continue;
    }

    rows.push({
      subjectType,
      subjectId,
      name: col(cols, 'name'),
      valueNative,
      currency: col(cols, 'currency') || 'IDR',
      fxRateToIdr,
      valueIdr: valueNative * fxRateToIdr,
      valuedAt,
      notes: col(cols, 'notes') || undefined,
    });
  }

  return { rows, errors, skippedEmpty };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
