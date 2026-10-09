import type { DateOrder, ImportField, ImportMapping, TransactionType } from '@webspend/shared';

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  date: 'Date',
  amount: 'Amount (signed)',
  debit: 'Debit (money out)',
  credit: 'Credit (money in)',
  description: 'Description',
  counterparty: 'Payee / counterparty',
  reference: 'Reference',
  balance: 'Balance after',
  ignore: 'Ignore',
};

export const DATE_ORDER_LABELS: Record<DateOrder, string> = {
  dmy: 'Day first (31/12/2026)',
  mdy: 'Month first (12/31/2026)',
  ymd: 'Year first (2026-12-31)',
};

export function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      record.push(field);
      field = '';
      if (record.some((f) => f.trim() !== '')) records.push(record);
      record = [];
    } else field += ch;
  }
  record.push(field);
  if (record.some((f) => f.trim() !== '')) records.push(record);

  const [header, ...body] = records;
  if (!header) return { columns: [], rows: [] };
  const columns = header.map((h, i) => h.trim() || `Column ${i + 1}`);
  const rows = body.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])));
  return { columns, rows };
}

const FIELD_HINTS: [ImportField, RegExp][] = [
  ['date', /^(trans(action)?[ _-]?)?(date|time|posted|value[ _-]?date|datetime)$/i],
  ['debit', /^(debit|withdrawal|money[ _-]?out|out|dr)$/i],
  ['credit', /^(credit|deposit|money[ _-]?in|in|cr)$/i],
  ['amount', /^(amount|amt|value|sum|total)$/i],
  ['balance', /^(balance|bal|running[ _-]?balance|closing[ _-]?balance|balance[ _-]?after)$/i],
  ['reference', /^(ref(erence)?|ref[ _-]?no|transaction[ _-]?id|id|session[ _-]?id)$/i],
  ['counterparty', /^(payee|counterparty|beneficiary|recipient|merchant|name|to|from|sender)$/i],
  ['description', /^(description|desc|narration|narrative|remarks?|memo|details?|particulars)$/i],
];

export function guessMapping(columns: readonly string[]): ImportMapping {
  const mapping: Record<string, ImportField> = {};
  const used = new Set<ImportField>();
  for (const col of columns) {
    const key = col.trim();
    let field: ImportField = 'ignore';
    for (const [candidate, re] of FIELD_HINTS) {
      if (used.has(candidate)) continue;
      if (re.test(key)) {
        field = candidate;
        break;
      }
    }
    if (field === 'ignore') {
      // Looser second pass on substrings.
      if (!used.has('date') && /date/i.test(key)) field = 'date';
      else if (!used.has('debit') && /debit|withdraw/i.test(key)) field = 'debit';
      else if (!used.has('credit') && /credit|deposit/i.test(key)) field = 'credit';
      else if (!used.has('amount') && /amount/i.test(key)) field = 'amount';
      else if (!used.has('balance') && /balance/i.test(key)) field = 'balance';
      else if (!used.has('reference') && /ref/i.test(key)) field = 'reference';
      else if (!used.has('description') && /desc|narr|remark|memo/i.test(key))
        field = 'description';
    }
    if (field !== 'ignore') used.add(field);
    mapping[key] = field;
  }
  const hasDebitCredit = used.has('debit') || used.has('credit');
  if (hasDebitCredit && used.has('amount')) {
    // Prefer the explicit pair over a signed column.
    for (const k of Object.keys(mapping)) if (mapping[k] === 'amount') mapping[k] = 'ignore';
  }
  return { columns: mapping, dateOrder: 'dmy', negativeIsExpense: true };
}

export function mappingProblems(mapping: ImportMapping): string[] {
  const fields = new Set(Object.values(mapping.columns));
  const problems: string[] = [];
  if (!fields.has('date')) problems.push('Choose a Date column.');
  if (!fields.has('amount') && !fields.has('debit') && !fields.has('credit'))
    problems.push('Choose an Amount column, or Debit and/or Credit columns.');
  const counts = new Map<ImportField, number>();
  for (const f of fields) counts.set(f, 0);
  for (const f of Object.values(mapping.columns)) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, n] of counts)
    if (f !== 'ignore' && n > 1) problems.push(`Only one column can be ${IMPORT_FIELD_LABELS[f]}.`);
  return problems;
}

export function parseImportDate(value: string, order: DateOrder): Date | null {
  const v = value.trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = iso;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  const parts = v.match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
  if (parts) {
    const [, a = '', b = '', c = '', hh = '0', mm = '0'] = parts;
    let y: number;
    let m: number;
    let d: number;
    if (order === 'ymd' || a.length === 4) {
      y = Number(a);
      m = Number(b);
      d = Number(c);
    } else if (order === 'mdy') {
      m = Number(a);
      d = Number(b);
      y = Number(c);
    } else {
      d = Number(a);
      m = Number(b);
      y = Number(c);
    }
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, m - 1, d, Number(hh), Number(mm));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const loose = new Date(v);
  return Number.isNaN(loose.getTime()) ? null : loose;
}

/** "1,200.50", "₦1,200.50", "(1,200.50)", "-1200" → minor units with sign. Null when unreadable. */
export function parseImportAmount(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const negative = /^\(.*\)$/.test(v) || /^-|^[^\d]*-/.test(v) || /DR$/i.test(v);
  const digits = v.replace(/[^\d.]/g, '');
  if (!digits || !/^\d*(\.\d*)?$/.test(digits)) return null;
  const [whole = '0', fraction = ''] = digits.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  if (!Number.isFinite(minor)) return null;
  return negative ? -minor : minor;
}

export type MappedRow = {
  occurredAt: string;
  type: TransactionType;
  amountMinor: number;
  description: string | null;
  counterparty: string | null;
  reference: string | null;
  balanceMinor: number | null;
};

export function rowsToTransactions(
  rows: readonly Record<string, string>[],
  mapping: ImportMapping,
): { ok: MappedRow[]; errors: { row: number; reason: string }[] } {
  const colFor = (field: ImportField) =>
    Object.entries(mapping.columns).find(([, f]) => f === field)?.[0];
  const dateCol = colFor('date');
  const amountCol = colFor('amount');
  const debitCol = colFor('debit');
  const creditCol = colFor('credit');
  const descCol = colFor('description');
  const cpCol = colFor('counterparty');
  const refCol = colFor('reference');
  const balCol = colFor('balance');
  const ok: MappedRow[] = [];
  const errors: { row: number; reason: string }[] = [];
  rows.forEach((row, i) => {
    const rowNo = i + 1;
    const date = dateCol ? parseImportDate(row[dateCol] ?? '', mapping.dateOrder) : null;
    if (!date) {
      errors.push({
        row: rowNo,
        reason: `Could not read the date "${dateCol ? row[dateCol] : ''}"`,
      });
      return;
    }
    let amountMinor: number | null = null;
    let type: TransactionType = 'expense';
    if (amountCol) {
      const signed = parseImportAmount(row[amountCol] ?? '');
      if (signed === null) {
        errors.push({ row: rowNo, reason: `Could not read the amount "${row[amountCol]}"` });
        return;
      }
      const isExpense = mapping.negativeIsExpense ? signed < 0 : signed > 0;
      type = isExpense ? 'expense' : 'income';
      amountMinor = Math.abs(signed);
    } else {
      const debit = debitCol ? parseImportAmount(row[debitCol] ?? '') : null;
      const credit = creditCol ? parseImportAmount(row[creditCol] ?? '') : null;
      if (debit && debit !== 0) {
        type = 'expense';
        amountMinor = Math.abs(debit);
      } else if (credit && credit !== 0) {
        type = 'income';
        amountMinor = Math.abs(credit);
      }
    }
    if (!amountMinor) {
      errors.push({ row: rowNo, reason: 'No amount in this row' });
      return;
    }
    ok.push({
      occurredAt: date.toISOString(),
      type,
      amountMinor,
      description: descCol ? row[descCol] || null : null,
      counterparty: cpCol ? row[cpCol] || null : null,
      reference: refCol ? row[refCol] || null : null,
      balanceMinor: balCol ? parseImportAmount(row[balCol] ?? '') : null,
    });
  });
  return { ok, errors };
}
