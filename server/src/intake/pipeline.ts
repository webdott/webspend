/**
 * One bank email in, one `raw_alerts` row out, and a transaction when the email was a readable
 * alert for a tracked account. Every email is kept with its text whatever happens to it, so a
 * parser fix can be re-run and a changed layout is noticed rather than lost.
 */
import type { RawAlert, RawAlertStatus, User } from '@webspend/shared';
import { parseAlert, type ParsedAlert } from '../alerts/index.ts';
import type { Db, Row } from '../db/index.ts';
import { iso, text } from '../db/rows.ts';
import { accountNumbersMatch, listTrackedAccountsOfBank } from '../ledger/accounts.ts';
import { type RecordOptions, recordTransaction } from '../ledger/record.ts';

export type IncomingEmail = {
  userId: string;
  messageId: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: string;
  authenticated: boolean;
};

const COLUMNS = 'id, received_at, sender, subject, status, detail, transaction_id';

export function toRawAlert(row: Row): RawAlert {
  return {
    id: String(row.id),
    receivedAt: iso(row.received_at),
    sender: String(row.sender),
    subject: String(row.subject),
    status: row.status as RawAlertStatus,
    detail: text(row.detail),
    transactionId: text(row.transaction_id),
  };
}

export async function processAlertEmail(
  db: Db,
  user: User,
  email: IncomingEmail,
  options: RecordOptions = {},
): Promise<RawAlert> {
  const [seen] = await db.query(
    `select ${COLUMNS} from raw_alerts where user_id = $1 and message_id = $2`,
    [email.userId, email.messageId],
  );
  // Already processed: say so without touching the ledger again.
  if (seen) return { ...toRawAlert(seen), status: 'duplicate' };

  if (!email.authenticated) {
    return store(db, email, {
      status: 'failed_authentication',
      detail: 'the message did not pass SPF and DKIM checks',
    });
  }

  const outcome = await outcomeFor(db, email.userId, email);
  const stored = await store(db, email, outcome);
  if (outcome.status !== 'parsed') return stored;
  return logTransaction(db, user, stored, outcome, options);
}

/** The statuses a later parser fix can change; the rest were ruled out on purpose. */
const RERUNNABLE = ['unrecognised_layout', 'unknown_sender'];

/**
 * Pushes every alert that could not be read back through the current parsers, so an email kept
 * before its layout was supported is logged without being fetched again. Returns how many were
 * checked and how many became transactions.
 */
export async function rerunAlerts(
  db: Db,
  user: User,
  options: RecordOptions = {},
): Promise<{ checked: number; logged: number }> {
  const rows = await db.query(
    `select id, sender, subject, body_text from raw_alerts
      where user_id = $1 and status = any($2::text[]) order by received_at`,
    [user.id, RERUNNABLE],
  );
  let logged = 0;
  for (const row of rows) {
    const outcome = await outcomeFor(db, user.id, {
      from: String(row.sender),
      subject: String(row.subject),
      text: String(row.body_text),
    });
    const [updated] = await db.query(
      `update raw_alerts set status = $2, detail = $3, parsed = $4::jsonb, account_id = $5::uuid
        where id = $1::uuid returning ${COLUMNS}`,
      [
        row.id,
        outcome.status,
        outcome.detail ?? null,
        outcome.parsed ? JSON.stringify(outcome.parsed) : null,
        outcome.accountId ?? null,
      ],
    );
    if (outcome.status !== 'parsed') continue;
    await logTransaction(db, user, toRawAlert(updated!), outcome, options);
    logged += 1;
  }
  return { checked: rows.length, logged };
}

type Outcome = {
  status: RawAlertStatus;
  detail?: string;
  parsed?: ParsedAlert;
  accountId?: string;
};

/** What an email amounts to: a transaction for a tracked account, or the reason it is not. */
async function outcomeFor(
  db: Db,
  userId: string,
  email: { from: string; subject: string; text: string },
): Promise<Outcome> {
  const parsed = parseAlert(email);
  if (!parsed.ok) return { status: parsed.reason, detail: parsed.detail };

  const alert = parsed.alert;
  const account = await findTrackedAccount(db, userId, alert);
  if (!account) {
    return {
      status: 'before_tracking_from',
      detail: `no ${alert.bank} account is tracked`,
      parsed: alert,
    };
  }
  if (account.trackingFrom && Date.parse(alert.occurredAt) < Date.parse(account.trackingFrom)) {
    return {
      status: 'before_tracking_from',
      detail: `happened before tracking started on ${account.trackingFrom}`,
      parsed: alert,
      accountId: account.id,
    };
  }
  return { status: 'parsed', parsed: alert, accountId: account.id };
}

async function logTransaction(
  db: Db,
  user: User,
  stored: RawAlert,
  outcome: Outcome,
  options: RecordOptions,
): Promise<RawAlert> {
  const alert = outcome.parsed!;
  const { transaction } = await recordTransaction(
    db,
    user,
    {
      accountId: outcome.accountId!,
      occurredAt: alert.occurredAt,
      type: alert.direction === 'debit' ? 'expense' : 'income',
      direction: alert.direction,
      amountMinor: alert.amountMinor,
      currency: alert.currency,
      counterpartyName: alert.counterparty?.name ?? null,
      counterpartyBank: alert.counterparty?.bank ?? null,
      counterpartyAccount: alert.counterparty?.account ?? null,
      bankDescription: alert.description,
      source: 'alert',
      bankReference: alert.reference,
      rawAlertId: stored.id,
      balanceAfterMinor: alert.balanceAfterMinor,
      settledAmountMinor: alert.settled?.amountMinor ?? null,
      settledCurrency: alert.settled?.currency ?? null,
    },
    options,
  );
  await db.query('update raw_alerts set transaction_id = $2::uuid where id = $1::uuid', [
    stored.id,
    transaction.id,
  ]);
  return { ...stored, transactionId: transaction.id };
}

/**
 * The tracked account the alert is logged under. Every alert in the mailbox is the user's, so
 * knowing the bank is enough: the account whose number matches is preferred, else the bank's
 * first tracked account. Null only when no account at that bank is tracked.
 */
async function findTrackedAccount(db: Db, userId: string, alert: ParsedAlert) {
  const candidates = await listTrackedAccountsOfBank(db, userId, alert.bank);
  const byNumber = candidates.find((a) => accountNumbersMatch(alert.account, a.accountNumber));
  return byNumber ?? candidates[0] ?? null;
}

async function store(db: Db, email: IncomingEmail, result: Outcome): Promise<RawAlert> {
  const [row] = await db.query(
    `insert into raw_alerts (user_id, account_id, message_id, received_at, sender, subject,
       body_text, status, detail, parsed)
     values ($1, $2::uuid, $3, $4::timestamptz, $5, $6, $7, $8, $9, $10::jsonb)
     returning ${COLUMNS}`,
    [
      email.userId,
      result.accountId ?? null,
      email.messageId,
      email.receivedAt,
      email.from,
      email.subject,
      email.text,
      result.status,
      result.detail ?? null,
      result.parsed ? JSON.stringify(result.parsed) : null,
    ],
  );
  return toRawAlert(row!);
}

export async function listAlerts(
  db: Db,
  userId: string,
  filter: 'failed' | 'all',
  limit = 200,
): Promise<RawAlert[]> {
  const rows = await db.query(
    `select ${COLUMNS} from raw_alerts
      where user_id = $1
        and ($2 = 'all' or status in ('unrecognised_layout', 'unknown_sender', 'failed_authentication'))
      order by received_at desc limit $3`,
    [userId, filter, limit],
  );
  return rows.map(toRawAlert);
}

export async function seenMessageIds(db: Db, userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db.query<{ message_id: string }>(
    'select message_id from raw_alerts where user_id = $1 and message_id = any($2::text[])',
    [userId, ids],
  );
  return new Set(rows.map((r) => r.message_id));
}
