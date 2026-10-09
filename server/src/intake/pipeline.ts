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

  const parsed = parseAlert({ from: email.from, subject: email.subject, text: email.text });
  if (!parsed.ok) return store(db, email, { status: parsed.reason, detail: parsed.detail });

  const alert = parsed.alert;
  const account = await findTrackedAccount(db, email.userId, alert);
  if (!account) {
    return store(db, email, {
      status: 'before_tracking_from',
      detail: `no tracked ${alert.bank} account matches ${alert.account ?? 'this alert'}`,
      parsed: alert,
    });
  }
  if (account.trackingFrom && Date.parse(alert.occurredAt) < Date.parse(account.trackingFrom)) {
    return store(db, email, {
      status: 'before_tracking_from',
      detail: `happened before tracking started on ${account.trackingFrom}`,
      parsed: alert,
      accountId: account.id,
    });
  }

  const stored = await store(db, email, { status: 'parsed', parsed: alert, accountId: account.id });
  const { transaction } = await recordTransaction(
    db,
    user,
    {
      accountId: account.id,
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
 * The tracked account the alert belongs to: the one whose number matches the alert's (masked is
 * fine), else the only tracked account at that bank. OPay alerts carry no account number.
 */
async function findTrackedAccount(db: Db, userId: string, alert: ParsedAlert) {
  const candidates = await listTrackedAccountsOfBank(db, userId, alert.bank);
  const byNumber = candidates.find((a) => accountNumbersMatch(alert.account, a.accountNumber));
  if (byNumber) return byNumber;
  return candidates.length === 1 ? candidates[0]! : null;
}

async function store(
  db: Db,
  email: IncomingEmail,
  result: { status: RawAlertStatus; detail?: string; parsed?: ParsedAlert; accountId?: string },
): Promise<RawAlert> {
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
      where user_id = $1 and ($2 = 'all' or status not in ('parsed', 'duplicate'))
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
