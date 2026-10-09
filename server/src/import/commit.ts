import {
  type ImportCommitRequest,
  type ImportCommitResponse,
  NO_ACCOUNT,
  parseMinor,
  type User,
} from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { getAccount, unassignedAccount } from '../ledger/accounts.ts';
import { ensureCategories } from '../ledger/categories.ts';
import { InvalidRequestError } from '../ledger/errors.ts';
import { type RecordOptions, recordImportedRows } from '../ledger/record.ts';
import { lagosDay } from '../ledger/time.ts';
import type { Table } from './csv.ts';
import { parseDate } from './dates.ts';
import { readTable } from './table.ts';

type MappedRow = {
  occurredAt: string;
  amountMinor: number;
  direction: 'debit' | 'credit';
  description: string | null;
  counterparty: string | null;
  reference: string | null;
  category: string | null;
};

export async function commitImport(
  db: Db,
  user: User,
  request: ImportCommitRequest,
  options: RecordOptions = {},
): Promise<ImportCommitResponse> {
  const account =
    request.accountId === NO_ACCOUNT
      ? await unassignedAccount(db, user)
      : await getAccount(db, user.id, request.accountId);
  const table = readTable(request.format, request.content);
  const fields = invert(request.mapping.columns);
  if (!fields.date) throw new InvalidRequestError('the mapping needs a date column');
  if (!fields.amount && !fields.debit && !fields.credit) {
    throw new InvalidRequestError('the mapping needs an amount column or debit and credit columns');
  }

  const [importRow] = await db.query<{ id: string }>(
    `insert into imports (user_id, account_id, format, rows_total) values ($1, $2::uuid, $3, $4)
     returning id`,
    [user.id, account.id, request.format, table.rows.length],
  );
  const importId = importRow!.id;

  const errors: { row: number; reason: string }[] = [];
  const mapped: MappedRow[] = [];
  for (const [index, raw] of table.rows.entries()) {
    try {
      mapped.push(mapRow(raw, fields, request.mapping));
    } catch (error) {
      errors.push({ row: index + 1, reason: (error as Error).message });
    }
  }

  const categories = await ensureCategories(
    db,
    user.id,
    mapped.flatMap((row) => (row.category ? [row.category] : [])),
  );
  const categoryIdOf = (row: MappedRow) =>
    row.category ? (categories.ids.get(row.category.toLowerCase()) ?? null) : null;

  const ledger = await ledgerEntries(db, account.id, mapped);
  const fresh: MappedRow[] = [];
  const backfill = new Map<string, string>();
  for (const row of mapped) {
    const match = claimMatch(ledger, row);
    if (!match) {
      fresh.push(row);
      continue;
    }
    const categoryId = categoryIdOf(row);
    if (match.categoryId === null && categoryId) backfill.set(match.id, categoryId);
  }
  const added = fresh.length;
  const skipped = mapped.length - added;
  const categorised = await fillMissingCategories(db, user.id, backfill);
  await recordImportedRows(
    db,
    user,
    account,
    fresh.map((row) => ({
      occurredAt: row.occurredAt,
      direction: row.direction,
      amountMinor: row.amountMinor,
      counterpartyName: row.counterparty,
      bankDescription: row.description,
      bankReference: row.reference,
      categoryId: categoryIdOf(row),
    })),
    importId,
    options,
  );

  await db.query('update imports set rows_added = $2, rows_skipped = $3 where id = $1::uuid', [
    importId,
    added,
    skipped,
  ]);

  return { importId, added, skipped, categoriesCreated: categories.created, categorised, errors };
}

type Fields = Partial<Record<string, string>>;

function invert(columns: Record<string, string>): Fields {
  const fields: Fields = {};
  for (const [column, field] of Object.entries(columns)) {
    if (field !== 'ignore' && !(field in fields)) fields[field] = column;
  }
  return fields;
}

function mapRow(
  raw: Record<string, string>,
  fields: Fields,
  mapping: ImportCommitRequest['mapping'],
): MappedRow {
  const value = (field: string) => (fields[field] ? (raw[fields[field]!] ?? '').trim() : '');
  const occurredAt = parseDate(value('date'), mapping.dateOrder);
  if (!occurredAt) throw new Error(`unreadable date "${value('date')}"`);

  let amountMinor: number;
  let direction: 'debit' | 'credit';
  if (fields.amount) {
    const amount = readAmount(value('amount'));
    if (amount === null) throw new Error(`unreadable amount "${value('amount')}"`);
    if (amount === 0) throw new Error('the amount is zero');
    const negative = amount < 0;
    direction = negative === mapping.negativeIsExpense ? 'debit' : 'credit';
    amountMinor = Math.abs(amount);
  } else {
    const debit = readAmount(value('debit'));
    const credit = readAmount(value('credit'));
    if (debit && debit !== 0) {
      direction = 'debit';
      amountMinor = Math.abs(debit);
    } else if (credit && credit !== 0) {
      direction = 'credit';
      amountMinor = Math.abs(credit);
    } else throw new Error('neither debit nor credit has an amount');
  }

  return {
    occurredAt,
    amountMinor,
    direction,
    description: value('description') || null,
    counterparty: value('counterparty') || null,
    reference: value('reference') || null,
    category: value('category').replace(/\s+/g, ' ').slice(0, 60).trim() || null,
  };
}

/** `-1,200.50`, `(1,200.50)` and `NGN 1200` all read; blanks are null. */
function readAmount(text: string): number | null {
  if (!text.trim()) return null;
  const bracketed = /^\((.*)\)$/.exec(text.trim());
  const minor = parseMinor(bracketed ? `-${bracketed[1]}` : text);
  return minor;
}

type LedgerEntry = {
  id: string;
  categoryId: string | null;
  reference: string | null;
  description: string;
  claimed: boolean;
};

/** Gives each listed transaction its category, leaving alone any that gained one meanwhile. */
async function fillMissingCategories(
  db: Db,
  userId: string,
  categoryByTransaction: Map<string, string>,
): Promise<number> {
  if (categoryByTransaction.size === 0) return 0;
  const updated = await db.query(
    `update transactions t set category_id = v.category_id
       from unnest($2::uuid[], $3::uuid[]) as v(id, category_id)
      where t.user_id = $1 and t.id = v.id and t.category_id is null
      returning t.id`,
    [userId, [...categoryByTransaction.keys()], [...categoryByTransaction.values()]],
  );
  return updated.length;
}

/** The account's existing transactions on the days the import covers, keyed by day and amount. */
async function ledgerEntries(
  db: Db,
  accountId: string,
  rows: MappedRow[],
): Promise<Map<string, LedgerEntry[]>> {
  const entries = new Map<string, LedgerEntry[]>();
  if (rows.length === 0) return entries;
  const days = rows.map((row) => lagosDay(row.occurredAt)).sort();
  const existing = await db.query<{
    id: string;
    category_id: string | null;
    day: string;
    amount_minor: number;
    bank_reference: string | null;
    bank_description: string | null;
  }>(
    `select id, category_id, ((occurred_at + interval '1 hour')::date)::text as day, amount_minor,
       bank_reference, bank_description
       from transactions
      where account_id = $1::uuid and not is_fee
        and (occurred_at + interval '1 hour')::date between $2::date and $3::date`,
    [accountId, days[0], days.at(-1)],
  );
  for (const row of existing) {
    const key = `${row.day}|${Number(row.amount_minor)}`;
    const entry = {
      id: row.id,
      categoryId: row.category_id,
      reference: row.bank_reference,
      description: comparable(row.bank_description),
      claimed: false,
    };
    entries.set(key, [...(entries.get(key) ?? []), entry]);
  }
  return entries;
}

/**
 * Whether the row is already in the ledger: same account, amount and day, and then
 * - the same reference when both sides have one, else
 * - one description contained in the other once whitespace and case are ignored. Statements
 *   often carry a shortened form of the alert's narration ("WEB PUR SAMPLE CLOUD" against
 *   "WEB PUR SAMPLE CLOUD A1B2C3 CC …"), so equality alone misses real duplicates.
 * - a row with no description at all is taken as a duplicate of the same-day, same-amount entry.
 *
 * Each ledger entry can be claimed by one row only, and rows are compared with the ledger as it
 * was before this import. So two identical rows in one statement are two transactions the first
 * time, and both are skipped when the same statement is imported again.
 */
function claimMatch(ledger: Map<string, LedgerEntry[]>, row: MappedRow): LedgerEntry | null {
  const description = comparable(row.description);
  const candidates = ledger.get(`${lagosDay(row.occurredAt)}|${row.amountMinor}`) ?? [];
  const match = candidates.find((entry) => {
    if (entry.claimed) return false;
    if (row.reference !== null && entry.reference !== null)
      return entry.reference === row.reference;
    if (description === '') return true;
    return (
      entry.description !== '' &&
      (entry.description.includes(description) || description.includes(entry.description))
    );
  });
  if (!match) return null;
  match.claimed = true;
  return match;
}

function comparable(description: string | null): string {
  return (description ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export type { Table };
