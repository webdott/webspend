/**
 * `recordTransaction` is the one way a transaction enters the ledger, whether from an alert, an
 * import or a manual entry. It stamps the day's exchange rate, inserts the row and then runs the
 * rules: remembered category, transfer-to-self pairing and (for alerts) the balance check.
 */
import type {
  Currency,
  Transaction,
  TransactionSource,
  TransactionType,
  User,
} from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { rateFor, refreshToday } from '../rates/store.ts';
import type { RateSource } from '../rates/source.ts';
import { stampLastAlert } from './accounts.ts';
import { NotFoundError } from './errors.ts';
import { type BalanceOutcome, checkBalance } from './rules/balance.ts';
import { rememberedCategoryFor } from './rules/category.ts';
import { detectTransfer, startTransferGroup, type TransferOutcome } from './rules/transfer.ts';
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
  /** Only alerts carry it; its presence switches the balance check on. */
  balanceAfterMinor?: number | null;
  isFee?: boolean;
};

export type RecordOptions = {
  rateSource?: RateSource | null;
  feeThresholdMinor?: number;
};

export type RecordResult = {
  transaction: Transaction;
  transfer: TransferOutcome;
  balance: BalanceOutcome | null;
};

const DEFAULT_FEE_THRESHOLD_MINOR = 50_000;

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
  const feeThreshold = options.feeThresholdMinor ?? DEFAULT_FEE_THRESHOLD_MINOR;

  return db.transaction(async (tx) => {
    const remembered = await rememberedCategoryFor(tx, user.id, {
      counterpartyName: input.counterpartyName ?? null,
      bankDescription: input.bankDescription ?? null,
    });
    const categoryId =
      input.categoryId ?? (input.type === 'transfer' ? null : remembered.categoryId);

    const id = await insertRow(
      tx,
      user.id,
      input,
      direction,
      fxPerUsd,
      categoryId,
      remembered.payeeKey,
    );
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

    let balance: BalanceOutcome | null = null;
    if (input.balanceAfterMinor !== undefined && input.balanceAfterMinor !== null) {
      balance = await checkBalance(tx, user, leg, input.balanceAfterMinor, feeThreshold, recordFee);
    } else if (input.source === 'alert' && !input.isFee) {
      await stampLastAlert(tx, input.accountId, input.occurredAt);
    }

    return { transaction: await getTransaction(tx, user, id), transfer, balance };
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

async function insertRow(
  db: Db,
  userId: string,
  input: RecordInput,
  direction: 'debit' | 'credit',
  fxPerUsd: number | null,
  categoryId: string | null,
  payeeKey: string | null,
): Promise<string> {
  const [account] = await db.query<{ id: string }>(
    'select id from accounts where user_id = $1 and id = $2::uuid',
    [userId, input.accountId],
  );
  if (!account) throw new NotFoundError('account not found');
  const [row] = await db.query<{ id: string }>(
    `insert into transactions (user_id, account_id, occurred_at, type, direction, amount_minor,
       currency, fx_per_usd, counterparty_name, counterparty_bank, counterparty_account,
       bank_description, user_description, category_id, source, bank_reference, raw_alert_id,
       import_id, is_fee, balance_after_minor, payee_key)
     values ($1, $2::uuid, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::uuid,
       $15, $16, $17::uuid, $18::uuid, $19, $20, $21)
     returning id`,
    [
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
    ],
  );
  return row!.id;
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
