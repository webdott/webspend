import { BANK_LABELS, type Transaction, type TransactionType, type User } from '@webspend/shared';
import { lagosClock, lagosDay } from '../ledger/time.ts';

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer to self',
};

const SOURCE_LABELS: Record<Transaction['source'], string> = {
  alert: 'Bank alert',
  import: 'Statement import',
  manual: 'Entered by hand',
};

/**
 * One row per transaction as a spreadsheet reads it. Starts with a byte-order mark so Excel
 * decodes the naira sign, and ends every line with CRLF per RFC 4180.
 */
export function transactionsCsv(
  transactions: Transaction[],
  user: Pick<User, 'defaultCurrency'>,
): string {
  const header = [
    'Date',
    'Time',
    'Type',
    'Title',
    'Description',
    'Category',
    'Account',
    'Bank',
    'Amount',
    'Currency',
    `Amount (${user.defaultCurrency})`,
    'USD equivalent',
    'Counterparty',
    'Reference',
    'Source',
  ];
  const lines = [header, ...transactions.map(row)].map((cells) => cells.map(cell).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function row(t: Transaction): string[] {
  const money = (minor: number | null) => (minor === null ? '' : decimal(minor, t.type));
  return [
    lagosDay(t.occurredAt),
    lagosClock(t.occurredAt),
    TYPE_LABELS[t.type],
    t.title,
    t.userDescription ?? '',
    t.categoryName ?? '',
    t.accountName,
    BANK_LABELS[t.bank],
    money(t.amountMinor),
    t.currency,
    money(t.defaultMinor),
    money(t.usdMinor),
    t.counterpartyName ?? '',
    t.bankReference ?? '',
    SOURCE_LABELS[t.source],
  ];
}

/** `1850000` → `-18500.00` for an expense. No grouping, so spreadsheets read it as a number. */
export function decimal(minor: number, type: TransactionType): string {
  const abs = Math.abs(minor);
  const sign = type === 'expense' ? '-' : '';
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Quotes a cell when it needs it. A cell starting with a formula character is prefixed with an
 * apostrophe so a spreadsheet shows it as text instead of running it.
 */
function cell(value: string): string {
  const safe = /^[=+@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
