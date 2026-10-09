import {
  type ImportCommitRequest,
  type ImportCommitResponse,
  parseMinor,
  type User,
} from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { getAccount } from '../ledger/accounts.ts';
import { InvalidRequestError } from '../ledger/errors.ts';
import { getGap, markGapFilled } from '../ledger/gaps.ts';
import { type RecordOptions, recordTransaction } from '../ledger/record.ts';
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
};

export async function commitImport(
  db: Db,
  user: User,
  request: ImportCommitRequest,
  options: RecordOptions = {},
): Promise<ImportCommitResponse> {
  const account = await getAccount(db, user.id, request.accountId);
  const gap = request.gapId ? await getGap(db, user.id, request.gapId) : null;
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

  let added = 0;
  let skipped = 0;
  const errors: { row: number; reason: string }[] = [];
  const seenDays: string[] = [];

  for (const [index, raw] of table.rows.entries()) {
    const rowNumber = index + 1;
    let row: MappedRow;
    try {
      row = mapRow(raw, fields, request.mapping);
    } catch (error) {
      errors.push({ row: rowNumber, reason: (error as Error).message });
      continue;
    }
    seenDays.push(lagosDay(row.occurredAt));
    if (await isDuplicate(db, account.id, row)) {
      skipped += 1;
      continue;
    }
    await recordTransaction(
      db,
      user,
      {
        accountId: account.id,
        occurredAt: row.occurredAt,
        type: row.direction === 'debit' ? 'expense' : 'income',
        direction: row.direction,
        amountMinor: row.amountMinor,
        currency: account.currency,
        counterpartyName: row.counterparty,
        bankDescription: row.description,
        bankReference: row.reference,
        source: 'import',
        importId,
      },
      options,
    );
    added += 1;
  }

  await db.query('update imports set rows_added = $2, rows_skipped = $3 where id = $1::uuid', [
    importId,
    added,
    skipped,
  ]);

  // The gap counts as filled when the imported rows reach into its window.
  if (gap && seenDays.length > 0) {
    const first = seenDays.reduce((a, b) => (a < b ? a : b));
    const last = seenDays.reduce((a, b) => (a > b ? a : b));
    if (first <= lagosDay(gap.toAt) && last >= lagosDay(gap.fromAt)) {
      await markGapFilled(db, user.id, gap.id, importId);
    }
  }

  return { importId, added, skipped, errors };
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
  };
}

/** `-1,200.50`, `(1,200.50)` and `NGN 1200` all read; blanks are null. */
function readAmount(text: string): number | null {
  if (!text.trim()) return null;
  const bracketed = /^\((.*)\)$/.exec(text.trim());
  const minor = parseMinor(bracketed ? `-${bracketed[1]}` : text);
  return minor;
}

/**
 * A row already in the ledger: same account, amount and day, and then
 * - the same reference when both sides have one, else
 * - one description contained in the other once whitespace and case are ignored. Statements
 *   often carry a shortened form of the alert's narration ("WEB PUR SAMPLE CLOUD" against
 *   "WEB PUR SAMPLE CLOUD A1B2C3 CC …"), so equality alone misses real duplicates.
 * - a row with no description at all is taken as a duplicate of the same-day, same-amount entry.
 */
async function isDuplicate(db: Db, accountId: string, row: MappedRow): Promise<boolean> {
  const description = (row.description ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const rows = await db.query(
    `select 1 from transactions t,
       lateral (select lower(regexp_replace(coalesce(t.bank_description, ''), '\\s+', ' ', 'g')) as text) d
      where t.account_id = $1::uuid and t.amount_minor = $2 and not t.is_fee
        and (t.occurred_at + interval '1 hour')::date = $3::date
        and case
              when $4::text is not null and t.bank_reference is not null then t.bank_reference = $4
              when $5::text = '' then true
              else d.text <> '' and (position($5 in d.text) > 0 or position(d.text in $5) > 0)
            end
      limit 1`,
    [accountId, row.amountMinor, lagosDay(row.occurredAt), row.reference, description],
  );
  return rows.length > 0;
}

export type { Table };
