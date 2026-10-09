import type { Account, AccountStatus, Bank, Currency } from '@webspend/shared';
import type { Db, Row } from '../db/index.ts';
import { integerOrNull, isoOrNull, text } from '../db/rows.ts';
import { ConflictError, NotFoundError } from './errors.ts';

const COLUMNS = `id, bank, name, account_number, currency, is_own, tracked, tracking_from,
  last_balance_minor, last_balance_at, last_alert_at`;

export function toAccount(row: Row): Account {
  const trackingFrom = isoOrNull(row.tracking_from);
  const lastAlertAt = isoOrNull(row.last_alert_at);
  return {
    id: String(row.id),
    bank: row.bank as Bank,
    name: String(row.name),
    accountNumber: text(row.account_number),
    currency: row.currency as Currency,
    isOwn: Boolean(row.is_own),
    tracked: Boolean(row.tracked),
    trackingFrom,
    status: statusOf(Boolean(row.tracked), trackingFrom, lastAlertAt),
    lastBalanceMinor: integerOrNull(row.last_balance_minor),
    lastBalanceAt: isoOrNull(row.last_balance_at),
    lastAlertAt,
  };
}

function statusOf(
  tracked: boolean,
  trackingFrom: string | null,
  lastAlertAt: string | null,
): AccountStatus {
  if (!tracked) return 'off';
  if (!lastAlertAt) return 'waiting';
  if (trackingFrom && Date.parse(lastAlertAt) < Date.parse(trackingFrom)) return 'waiting';
  return 'tracking';
}

export async function listAccounts(db: Db, userId: string): Promise<Account[]> {
  const rows = await db.query(
    `select ${COLUMNS} from accounts where user_id = $1 order by created_at, name`,
    [userId],
  );
  return rows.map(toAccount);
}

export async function getAccount(db: Db, userId: string, id: string): Promise<Account> {
  const [row] = await db.query(
    `select ${COLUMNS} from accounts where user_id = $1 and id = $2::uuid`,
    [userId, id],
  );
  if (!row) throw new NotFoundError('account not found');
  return toAccount(row);
}

export async function createAccount(
  db: Db,
  userId: string,
  input: {
    bank: Bank;
    name: string;
    accountNumber?: string | null;
    currency?: Currency;
    isOwn?: boolean;
  },
): Promise<Account> {
  const [row] = await db.query(
    `insert into accounts (user_id, bank, name, account_number, currency, is_own)
     values ($1, $2, $3, $4, $5, $6) returning ${COLUMNS}`,
    [
      userId,
      input.bank,
      input.name,
      input.accountNumber ?? null,
      input.currency ?? (input.bank === 'grey' ? 'USD' : 'NGN'),
      input.isOwn ?? true,
    ],
  );
  return toAccount(row!);
}

/**
 * Switching tracking on stamps `tracking_from` with now and forgets the last balance, so the
 * next alert opens a fresh balance chain. Switching it off keeps everything already logged.
 */
export async function updateAccount(
  db: Db,
  userId: string,
  id: string,
  patch: { name?: string; accountNumber?: string | null; isOwn?: boolean; tracked?: boolean },
  now: Date = new Date(),
): Promise<Account> {
  const current = await getAccount(db, userId, id);
  const switchingOn = patch.tracked === true && !current.tracked;
  const [row] = await db.query(
    `update accounts set
       name = coalesce($3, name),
       account_number = case when $4 then $5 else account_number end,
       is_own = coalesce($6, is_own),
       tracked = coalesce($7, tracked),
       tracking_from = case when $8 then $9::timestamptz else tracking_from end,
       last_balance_minor = case when $8 then null else last_balance_minor end,
       last_balance_at = case when $8 then null else last_balance_at end
     where user_id = $1 and id = $2::uuid returning ${COLUMNS}`,
    [
      userId,
      id,
      patch.name ?? null,
      'accountNumber' in patch,
      patch.accountNumber ?? null,
      patch.isOwn ?? null,
      patch.tracked ?? null,
      switchingOn,
      now.toISOString(),
    ],
  );
  return toAccount(row!);
}

export async function deleteAccount(db: Db, userId: string, id: string): Promise<void> {
  await getAccount(db, userId, id);
  const [count] = await db.query<{ n: number }>(
    'select count(*)::int as n from transactions where account_id = $1::uuid',
    [id],
  );
  if (count && Number(count.n) > 0) {
    throw new ConflictError('the account still has transactions');
  }
  await db.query('delete from accounts where user_id = $1 and id = $2::uuid', [userId, id]);
}

export async function listOwnAccounts(db: Db, userId: string): Promise<Account[]> {
  const rows = await db.query(
    `select ${COLUMNS} from accounts where user_id = $1 and is_own order by created_at`,
    [userId],
  );
  return rows.map(toAccount);
}

export async function listTrackedAccountsOfBank(
  db: Db,
  userId: string,
  bank: string,
): Promise<Account[]> {
  const rows = await db.query(
    `select ${COLUMNS} from accounts
      where user_id = $1 and bank = $2 and tracked order by created_at`,
    [userId, bank],
  );
  return rows.map(toAccount);
}

export async function stampLastAlert(db: Db, accountId: string, at: string): Promise<void> {
  await db.query(
    `update accounts set last_alert_at = greatest(coalesce(last_alert_at, $2::timestamptz), $2::timestamptz)
     where id = $1::uuid`,
    [accountId, at],
  );
}

/**
 * Whether two account numbers refer to the same account when one or both may be masked
 * (`*****00001`, `******0001`). Full numbers must match exactly; a masked one matches when the
 * other ends with its visible digits, which must be at least four.
 */
export function accountNumbersMatch(a: string | null, b: string | null): boolean {
  return accountNumberMatch(a, b) !== null;
}

/** How two account numbers match: every digit (`full`), only the visible tail of a masked one, or not at all. */
export function accountNumberMatch(
  a: string | null,
  b: string | null,
): 'full' | 'last-digits' | null {
  if (!a || !b) return null;
  const first = visibleDigits(a);
  const second = visibleDigits(b);
  if (!first.masked && !second.masked) return first.digits === second.digits ? 'full' : null;
  const shorter = first.digits.length <= second.digits.length ? first.digits : second.digits;
  const longer = shorter === first.digits ? second.digits : first.digits;
  return shorter.length >= 4 && longer.endsWith(shorter) ? 'last-digits' : null;
}

function visibleDigits(value: string): { digits: string; masked: boolean } {
  const masked = /[*xX•]/.test(value);
  const tail = masked ? value.replace(/^.*[*xX•]/, '') : value;
  return { digits: tail.replace(/\D/g, ''), masked };
}

export function bankCodeFromLabel(label: string | null): Bank | null {
  if (!label) return null;
  const lower = label.toLowerCase();
  if (lower.includes('guaranty') || lower.includes('gtb')) return 'gtbank';
  if (lower.includes('opay')) return 'opay';
  if (lower.includes('moniepoint')) return 'moniepoint';
  if (lower.includes('uba') || lower.includes('united bank')) return 'uba';
  if (lower.includes('grey')) return 'grey';
  return null;
}
