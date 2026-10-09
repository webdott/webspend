/**
 * The two ways a transaction enters the ledger. `recordTransaction` takes one alert or manual
 * entry; `recordImportedRows` takes a whole statement at once. Both stamp the day's exchange
 * rate, insert, and then run the rules: remembered category and transfer-to-self pairing.
 */
import { randomUUID } from 'node:crypto';
import type {
  Currency,
  Transaction,
  TransactionSource,
  TransactionType,
  User,
} from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { rateFor, rateOnOrBefore, ratesUpTo, refreshToday } from '../rates/store.ts';
import type { RateSource } from '../rates/source.ts';
import { stampLastAlert } from './accounts.ts';
import { NotFoundError } from './errors.ts';
import { payeeKeyFor, rememberedCategories } from './payees.ts';
import { rememberedCategoryFor } from './rules/category.ts';
import {
  couldPair,
  detectTransfer,
  pairingCandidates,
  startTransferGroup,
  type TransferOutcome,
} from './rules/transfer.ts';
import { LEG_SELECT, type Leg, toLeg } from './rules/types.ts';
import { lagosDay, todayLagos } from './time.ts';
import { getTransaction } from './transactions.ts';

export type RecordInput = {
  accountId: string;
  occurredAt: string;
  type: TransactionType;
  direction?: 'debit' | 'credit';
  amountMinor: number;
  currency: Currency;
  counterpartyName?: string | null;
  counterpartyBank?: string | null;
  counterpartyAccount?: string | null;
  bankDescription?: string | null;
  userDescription?: string | null;
  categoryId?: string | null;
  source: TransactionSource;
  bankReference?: string | null;
  rawAlertId?: string | null;
  importId?: string | null;
  /** The balance the alert reported. Stored as given; nothing is checked against it. */
  balanceAfterMinor?: number | null;
  isFee?: boolean;
};

export type RecordOptions = {
  rateSource?: RateSource | null;
};

export type RecordResult = {
  transaction: Transaction;
  transfer: TransferOutcome;
};

export type ImportedRow = {
  occurredAt: string;
  direction: 'debit' | 'credit';
  amountMinor: number;
  counterpartyName: string | null;
  bankDescription: string | null;
  bankReference: string | null;
};

type PreparedRow = {
  id: string;
  input: RecordInput;
  direction: 'debit' | 'credit';
  fxPerUsd: number | null;
  categoryId: string | null;
  payeeKey: string | null;
};

// 22 parameters a row; Postgres allows 65,535 a statement.
const INSERT_CHUNK = 500;

// A failed refresh is not retried until the next day, so an offline server does not call out on
// every transaction.
let rateRefreshAttemptedOn: string | null = null;

export async function recordTransaction(
  db: Db,
  user: User,
  input: RecordInput,
  options: RecordOptions = {},
): Promise<RecordResult> {
  const fxPerUsd = await rateWithRefresh(db, input.currency, lagosDay(input.occurredAt), options);
  const direction = input.direction ?? (input.type === 'income' ? 'credit' : 'debit');

  return db.transaction(async (tx) => {
    const remembered = await rememberedCategoryFor(tx, user.id, {
      counterpartyName: input.counterpartyName ?? null,
      bankDescription: input.bankDescription ?? null,
    });
    const categoryId =
      input.categoryId ?? (input.type === 'transfer' ? null : remembered.categoryId);

    const [account] = await tx.query<{ id: string }>(
      'select id from accounts where user_id = $1 and id = $2::uuid',
      [user.id, input.accountId],
    );
    if (!account) throw new NotFoundError('account not found');
    const id = randomUUID();
    await insertRows(tx, user.id, [
      { id, input, direction, fxPerUsd, categoryId, payeeKey: remembered.payeeKey },
    ]);
    const leg = await loadLeg(tx, user.id, id);
    const recordFee = feeRecorder(tx, user);

    let transfer: TransferOutcome = { paired: false };
    if (!input.isFee) {
      if (input.type === 'transfer') {
        transfer = {
          paired: true,
          groupId: await startTransferGroup(tx, user.id, leg),
          partnerId: null,
          feeId: null,
        };
      } else if (input.source !== 'manual') {
        // A manual entry's type is the user's explicit choice; alerts and imports are inferred.
        transfer = await detectTransfer(tx, user, leg, recordFee);
      }
    }

    if (input.source === 'alert' && !input.isFee) {
      await stampLastAlert(tx, input.accountId, input.occurredAt);
    }

    return { transaction: await getTransaction(tx, user, id), transfer };
  });
}

/**
 * Adds a statement's rows in one transaction, so an import is all or nothing.
 *
 * Rates and remembered categories are loaded once and the rows are inserted in batches: a row
 * at a time costs a dozen database round trips, which made a 3,000-row statement take an hour.
 * Only rows that could plausibly pair with a leg in another own account go through
 * `detectTransfer`, which still makes the actual decision.
 */
export async function recordImportedRows(
  db: Db,
  user: User,
  account: { id: string; currency: Currency },
  rows: ImportedRow[],
  importId: string,
  options: RecordOptions = {},
): Promise<void> {
  if (rows.length === 0) return;
  const days = rows.map((row) => lagosDay(row.occurredAt)).sort();
  const lastDay = days.at(-1)!;
  await rateWithRefresh(db, account.currency, lastDay, options);
  const rates = account.currency === 'USD' ? null : await ratesUpTo(db, account.currency, lastDay);

  await db.transaction(async (tx) => {
    const remembered = await rememberedCategories(tx, user.id);
    const prepared = rows.map((row): PreparedRow => {
      const payeeKey = payeeKeyFor(row);
      return {
        id: randomUUID(),
        input: {
          accountId: account.id,
          occurredAt: row.occurredAt,
          type: row.direction === 'debit' ? 'expense' : 'income',
          amountMinor: row.amountMinor,
          currency: account.currency,
          counterpartyName: row.counterpartyName,
          bankDescription: row.bankDescription,
          bankReference: row.bankReference,
          source: 'import',
          importId,
        },
        direction: row.direction,
        fxPerUsd: rates ? rateOnOrBefore(rates, lagosDay(row.occurredAt)) : 1,
        categoryId: payeeKey ? (remembered.get(payeeKey) ?? null) : null,
        payeeKey,
      };
    });
    for (let start = 0; start < prepared.length; start += INSERT_CHUNK) {
      await insertRows(tx, user.id, prepared.slice(start, start + INSERT_CHUNK));
    }

    const times = rows.map((row) => Date.parse(row.occurredAt));
    const candidates = await pairingCandidates(tx, user.id, account.id, {
      from: new Date(Math.min(...times)).toISOString(),
      to: new Date(Math.max(...times)).toISOString(),
    });
    if (candidates.length === 0) return;
    const recordFee = feeRecorder(tx, user);
    for (const row of prepared) {
      const leg = {
        direction: row.direction,
        amountMinor: row.input.amountMinor,
        currency: account.currency,
        occurredAt: row.input.occurredAt,
        bankReference: row.input.bankReference ?? null,
      };
      if (!couldPair(leg, candidates)) continue;
      await detectTransfer(tx, user, await loadLeg(tx, user.id, row.id), recordFee);
    }
  });
}

/** Fee and exchange-loss rows go through the same insert so they carry a rate and a payee key. */
function feeRecorder(db: Db, user: User) {
  return async (fee: {
    accountId: string;
    occurredAt: string;
    amountMinor: number;
    currency: Currency;
    description: string;
    categoryId: string;
    source: TransactionSource;
  }): Promise<string> => {
    const result = await recordTransaction(db, user, {
      accountId: fee.accountId,
      occurredAt: fee.occurredAt,
      type: 'expense',
      direction: 'debit',
      amountMinor: fee.amountMinor,
      currency: fee.currency,
      bankDescription: fee.description,
      categoryId: fee.categoryId,
      source: fee.source,
      isFee: true,
    });
    return result.transaction.id;
  };
}

const INSERT_COLUMNS = `id, user_id, account_id, occurred_at, type, direction, amount_minor,
  currency, fx_per_usd, counterparty_name, counterparty_bank, counterparty_account,
  bank_description, user_description, category_id, source, bank_reference, raw_alert_id,
  import_id, is_fee, balance_after_minor, payee_key`;
const INSERT_CASTS: Record<number, string> = {
  0: '::uuid',
  2: '::uuid',
  3: '::timestamptz',
  14: '::uuid',
  17: '::uuid',
  18: '::uuid',
};

async function insertRows(db: Db, userId: string, rows: PreparedRow[]): Promise<void> {
  const params: unknown[] = [];
  const tuples = rows.map(({ id, input, direction, fxPerUsd, categoryId, payeeKey }) => {
    const values = [
      id,
      userId,
      input.accountId,
      input.occurredAt,
      input.type,
      direction,
      input.amountMinor,
      input.currency,
      fxPerUsd,
      input.counterpartyName ?? null,
      input.counterpartyBank ?? null,
      input.counterpartyAccount ?? null,
      input.bankDescription ?? null,
      input.userDescription ?? null,
      categoryId,
      input.source,
      input.bankReference ?? null,
      input.rawAlertId ?? null,
      input.importId ?? null,
      input.isFee ?? false,
      input.balanceAfterMinor ?? null,
      payeeKey,
    ];
    const placeholders = values.map((value, column) => {
      params.push(value);
      return `$${params.length}${INSERT_CASTS[column] ?? ''}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  await db.query(
    `insert into transactions (${INSERT_COLUMNS}) values ${tuples.join(', ')}`,
    params,
  );
}

async function loadLeg(db: Db, userId: string, id: string): Promise<Leg> {
  const [row] = await db.query(`${LEG_SELECT} where o.user_id = $1 and o.id = $2::uuid`, [
    userId,
    id,
  ]);
  return toLeg(row!);
}

async function rateWithRefresh(
  db: Db,
  currency: Currency,
  day: string,
  options: RecordOptions,
): Promise<number | null> {
  const known = await rateFor(db, currency, day);
  if (known !== null || !options.rateSource) return known;
  const today = todayLagos();
  if (rateRefreshAttemptedOn === today) return null;
  rateRefreshAttemptedOn = today;
  try {
    await refreshToday(db, options.rateSource);
  } catch (error) {
    console.warn(`rates: refresh failed: ${(error as Error).message}`);
    return null;
  }
  return rateFor(db, currency, day);
}
