/**
 * Rule 3, balance check. Every alert says what the balance was afterwards. If the last known
 * balance moved by anything other than this transaction's amount, something was missed: a small
 * drop is a bank fee and is logged as one; anything else becomes a gap for a statement import.
 */
import type { User } from '@webspend/shared';
import type { Db } from '../../db/index.ts';
import { isoOrNull } from '../../db/rows.ts';
import { stampBalance, stampLastAlert } from '../accounts.ts';
import { ensureCategory } from '../categories.ts';
import { insertGap } from '../gaps.ts';
import { FEES_CATEGORY, type FeeRecorder } from './transfer.ts';
import type { Leg } from './types.ts';

export const BANK_FEE_DESCRIPTION = 'Bank fee';

export type BalanceOutcome =
  | { kind: 'opened' }
  | { kind: 'out_of_order' }
  | { kind: 'matched' }
  | { kind: 'fee'; feeId: string; amountMinor: number }
  | { kind: 'gap'; gapId: string; differenceMinor: number };

export async function checkBalance(
  db: Db,
  user: User,
  leg: Leg,
  balanceAfterMinor: number,
  feeThresholdMinor: number,
  recordFee: FeeRecorder,
): Promise<BalanceOutcome> {
  const [account] = await db.query<{ last_balance_minor: number | null; last_balance_at: unknown }>(
    'select last_balance_minor, last_balance_at from accounts where id = $1::uuid',
    [leg.accountId],
  );
  const lastBalance = account?.last_balance_minor ?? null;
  const lastAt = isoOrNull(account?.last_balance_at);

  if (lastBalance === null || lastAt === null) {
    // The first alert since tracking began supplies the opening balance.
    await stampBalance(db, leg.accountId, balanceAfterMinor, leg.occurredAt);
    return { kind: 'opened' };
  }
  if (Date.parse(leg.occurredAt) < Date.parse(lastAt)) {
    // Delivered out of order: the chain already moved past this point, so there is nothing to compare.
    await stampLastAlert(db, leg.accountId, leg.occurredAt);
    return { kind: 'out_of_order' };
  }

  const expected =
    leg.direction === 'debit' ? lastBalance - leg.amountMinor : lastBalance + leg.amountMinor;
  const difference = balanceAfterMinor - expected;
  let outcome: BalanceOutcome = { kind: 'matched' };
  if (difference < 0 && -difference <= feeThresholdMinor) {
    const fees = await ensureCategory(db, user.id, FEES_CATEGORY);
    const feeId = await recordFee({
      accountId: leg.accountId,
      occurredAt: leg.occurredAt,
      amountMinor: -difference,
      currency: leg.currency,
      description: BANK_FEE_DESCRIPTION,
      categoryId: fees.id,
      source: 'alert',
    });
    outcome = { kind: 'fee', feeId, amountMinor: -difference };
  } else if (difference !== 0) {
    const gap = await insertGap(db, {
      userId: user.id,
      accountId: leg.accountId,
      fromAt: lastAt,
      toAt: leg.occurredAt,
      expectedBalanceMinor: expected,
      actualBalanceMinor: balanceAfterMinor,
      currency: leg.currency,
    });
    outcome = { kind: 'gap', gapId: gap.id, differenceMinor: difference };
  }
  await stampBalance(db, leg.accountId, balanceAfterMinor, leg.occurredAt);
  return outcome;
}
