/**
 * Rule 2, transfer to self. Money moving between the user's own accounts is not spending, so a
 * debit in one own account and the matching credit in another become one transfer group.
 *
 * Checks run in order of confidence: the alert names one of the user's own account numbers,
 * then the same bank reference on both legs, then an equal and opposite amount minutes apart,
 * then Grey's dollar-to-naira conversion where the amounts differ by the day's rate.
 */
import { randomUUID } from 'node:crypto';
import type { User } from '@webspend/shared';
import type { Db } from '../../db/index.ts';
import { accountNumbersMatch, bankCodeFromLabel, listOwnAccounts } from '../accounts.ts';
import { ensureCategory } from '../categories.ts';
import { rateFor } from '../../rates/store.ts';
import { lagosDay } from '../time.ts';
import { type Leg, LEG_SELECT, toLeg, UNPAIRED } from './types.ts';

export const EXCHANGE_LOSS_DESCRIPTION = 'Exchange loss & fees';
export const FEES_CATEGORY = 'Fees';

const PAIR_WINDOW_MINUTES = 15;
const REFERENCE_WINDOW_DAYS = 7;
const GREY_WINDOW_HOURS = 24;
const GREY_TOLERANCE = 0.1;

export type TransferOutcome =
  | { paired: false }
  | { paired: true; groupId: string; partnerId: string | null; feeId: string | null };

/** Recorder for the exchange-loss expense, supplied by `record.ts` to avoid an import cycle. */
export type FeeRecorder = (input: {
  accountId: string;
  occurredAt: string;
  amountMinor: number;
  currency: Leg['currency'];
  description: string;
  categoryId: string;
  source: Leg['source'];
}) => Promise<string>;

export async function detectTransfer(
  db: Db,
  user: User,
  leg: Leg,
  recordFee: FeeRecorder,
): Promise<TransferOutcome> {
  if (leg.isFee) return { paired: false };
  const ownAccounts = (await listOwnAccounts(db, user.id)).filter((a) => a.id !== leg.accountId);

  const counterpartyBank = bankCodeFromLabel(leg.counterpartyBank);
  const ownCounterparty = ownAccounts.find(
    (account) =>
      accountNumbersMatch(leg.counterpartyAccount, account.accountNumber) &&
      (counterpartyBank === null || counterpartyBank === account.bank),
  );

  const partner =
    (await partnerByReference(db, user.id, leg)) ??
    (await partnerByAmount(db, user.id, leg, ownCounterparty?.id ?? null));
  if (partner) {
    const groupId = await pair(db, leg, partner);
    // A reference can join Grey's dollar leg to its naira leg; the shortfall still needs logging.
    const feeId = await logExchangeLoss(db, user, leg, partner, recordFee);
    return { paired: true, groupId, partnerId: partner.id, feeId };
  }
  if (ownCounterparty) {
    const groupId = leg.transferGroupId ?? randomUUID();
    await markTransfer(db, [leg.id], groupId);
    return { paired: true, groupId, partnerId: null, feeId: null };
  }

  // (d) Grey converting dollars to naira: the amounts differ by the rate, and the shortfall
  // against the official rate is the fee and exchange loss, logged as an expense.
  const partnerByRate = await greyConversion(db, user.id, leg);
  if (!partnerByRate) return { paired: false };
  const groupId = await pair(db, leg, partnerByRate);
  const feeId = await logExchangeLoss(db, user, leg, partnerByRate, recordFee);
  return { paired: true, groupId, partnerId: partnerByRate.id, feeId };
}

/**
 * For a dollar-to-naira pair, the gap between the official rate and what arrived is the fee and
 * exchange loss. Logged as an expense in the receiving account; null when there is none.
 */
async function logExchangeLoss(
  db: Db,
  user: User,
  leg: Leg,
  partner: Leg,
  recordFee: FeeRecorder,
): Promise<string | null> {
  const dollarLeg = [leg, partner].find((l) => l.currency === 'USD' && l.direction === 'debit');
  const nairaLeg = [leg, partner].find((l) => l.currency === 'NGN' && l.direction === 'credit');
  if (!dollarLeg || !nairaLeg) return null;
  const expectedKobo = await expectedKoboFor(db, dollarLeg);
  if (expectedKobo === null) return null;
  const lossMinor = expectedKobo - nairaLeg.amountMinor;
  if (lossMinor <= 0) return null;
  const fees = await ensureCategory(db, user.id, FEES_CATEGORY);
  return recordFee({
    accountId: nairaLeg.accountId,
    occurredAt: nairaLeg.occurredAt,
    amountMinor: lossMinor,
    currency: 'NGN',
    description: EXCHANGE_LOSS_DESCRIPTION,
    categoryId: fees.id,
    source: nairaLeg.source,
  });
}

async function expectedKoboFor(db: Db, dollarLeg: Leg): Promise<number | null> {
  const rate = await rateFor(db, 'NGN', lagosDay(dollarLeg.occurredAt));
  // Cents times naira-per-dollar is kobo, so no unit change is needed.
  return rate === null ? null : Math.round(dollarLeg.amountMinor * rate);
}

export async function startTransferGroup(db: Db, userId: string, leg: Leg): Promise<string> {
  const partner = await partnerByAmount(db, userId, leg, null);
  if (partner) return pair(db, leg, partner);
  const groupId = randomUUID();
  await markTransfer(db, [leg.id], groupId);
  return groupId;
}

async function pair(db: Db, leg: Leg, partner: Leg): Promise<string> {
  const groupId = partner.transferGroupId ?? leg.transferGroupId ?? randomUUID();
  await markTransfer(db, [leg.id, partner.id], groupId);
  return groupId;
}

async function markTransfer(db: Db, ids: string[], groupId: string): Promise<void> {
  await db.query(
    `update transactions set type = 'transfer', transfer_group_id = $2::uuid, category_id = null
     where id = any($1::uuid[])`,
    [ids, groupId],
  );
}

/** (b) The same bank reference on an opposite leg in another own account within seven days. */
async function partnerByReference(db: Db, userId: string, leg: Leg): Promise<Leg | null> {
  if (!leg.bankReference) return null;
  const rows = await db.query(
    `${LEG_SELECT}
     where o.user_id = $1 and o.id <> $2::uuid and o.account_id <> $3::uuid and oa.is_own
       and not o.is_fee and o.bank_reference = $4 and o.direction <> $5
       and abs(extract(epoch from (o.occurred_at - $6::timestamptz))) <= $7
       and ${UNPAIRED}
     order by abs(extract(epoch from (o.occurred_at - $6::timestamptz))) limit 1`,
    [
      userId,
      leg.id,
      leg.accountId,
      leg.bankReference,
      leg.direction,
      leg.occurredAt,
      REFERENCE_WINDOW_DAYS * 86_400,
    ],
  );
  return rows[0] ? toLeg(rows[0]) : null;
}

/** (c) An equal and opposite unpaired leg in another own account within fifteen minutes. */
async function partnerByAmount(
  db: Db,
  userId: string,
  leg: Leg,
  preferredAccountId: string | null,
): Promise<Leg | null> {
  const rows = await db.query(
    `${LEG_SELECT}
     where o.user_id = $1 and o.id <> $2::uuid and o.account_id <> $3::uuid and oa.is_own
       and not o.is_fee and o.direction <> $4 and o.currency = $5 and o.amount_minor = $6
       and abs(extract(epoch from (o.occurred_at - $7::timestamptz))) <= $8
       and ${UNPAIRED}
     order by (o.account_id::text = $9) desc,
       abs(extract(epoch from (o.occurred_at - $7::timestamptz))) limit 1`,
    [
      userId,
      leg.id,
      leg.accountId,
      leg.direction,
      leg.currency,
      leg.amountMinor,
      leg.occurredAt,
      PAIR_WINDOW_MINUTES * 60,
      preferredAccountId ?? '',
    ],
  );
  return rows[0] ? toLeg(rows[0]) : null;
}

/** (d) A USD debit from Grey and an NGN credit elsewhere within a day, related by the day's rate. */
async function greyConversion(db: Db, userId: string, leg: Leg): Promise<Leg | null> {
  const isDollarLeg = leg.currency === 'USD' && leg.direction === 'debit' && leg.bank === 'grey';
  const isNairaLeg = leg.currency === 'NGN' && leg.direction === 'credit';
  if (!isDollarLeg && !isNairaLeg) return null;

  const rows = await db.query(
    `${LEG_SELECT}
     where o.user_id = $1 and o.id <> $2::uuid and o.account_id <> $3::uuid and oa.is_own
       and not o.is_fee and o.direction = $4 and o.currency = $5 and ($6 or oa.bank = 'grey')
       and abs(extract(epoch from (o.occurred_at - $7::timestamptz))) <= $8
       and ${UNPAIRED}
     order by abs(extract(epoch from (o.occurred_at - $7::timestamptz)))`,
    [
      userId,
      leg.id,
      leg.accountId,
      isDollarLeg ? 'credit' : 'debit',
      isDollarLeg ? 'NGN' : 'USD',
      isDollarLeg,
      leg.occurredAt,
      GREY_WINDOW_HOURS * 3600,
    ],
  );
  for (const row of rows) {
    const candidate = toLeg(row);
    const dollarLeg = isDollarLeg ? leg : candidate;
    const nairaLeg = isDollarLeg ? candidate : leg;
    const expectedKobo = await expectedKoboFor(db, dollarLeg);
    if (expectedKobo === null) return null;
    if (Math.abs(nairaLeg.amountMinor - expectedKobo) > expectedKobo * GREY_TOLERANCE) continue;
    return candidate;
  }
  return null;
}
