/**
 * Exports: every transaction in a range of Lagos days as a CSV or PDF file. Pages through the
 * same list the apps show, so the filters and the computed amounts match what the user sees.
 */
import type { ExportQuery, Transaction } from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { todayLagos } from '../ledger/time.ts';
import { listTransactions, type TransactionFilters, type Viewer } from '../ledger/transactions.ts';
import { transactionsCsv } from './csv.ts';
import { type ExportRange, transactionsPdf } from './pdf.ts';

export type ExportFile = { filename: string; contentType: string; body: Uint8Array };

/** `to` defaults to today and `from` to the first day of `to`'s month. */
export function exportRange(
  query: Pick<ExportQuery, 'from' | 'to'>,
  today: string = todayLagos(),
): ExportRange {
  const to = query.to ?? today;
  const from = query.from ?? `${to.slice(0, 7)}-01`;
  return { from, to };
}

export async function buildExport(db: Db, user: Viewer, query: ExportQuery): Promise<ExportFile> {
  const range = exportRange(query);
  const transactions = await allTransactions(db, user, {
    ...range,
    accountId: query.accountId,
    categoryId: query.categoryId,
    type: query.type,
  });
  const filename = `webspend-${range.from}-to-${range.to}.${query.format}`;
  if (query.format === 'csv') {
    return {
      filename,
      contentType: 'text/csv; charset=utf-8',
      body: new TextEncoder().encode(transactionsCsv(transactions, user)),
    };
  }
  return {
    filename,
    contentType: 'application/pdf',
    body: await transactionsPdf(transactions, user, range),
  };
}

async function allTransactions(
  db: Db,
  user: Viewer,
  filters: TransactionFilters,
): Promise<Transaction[]> {
  const all: Transaction[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await listTransactions(db, user, { ...filters, limit: 500, before });
    all.push(...page.transactions);
    if (!page.hasMore) return all;
    before = page.transactions.at(-1)!.occurredAt;
  }
}
