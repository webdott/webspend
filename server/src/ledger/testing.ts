import { readFileSync } from 'node:fs';
import type { Account, User } from '@webspend/shared';
import { type Db, openDb } from '../db/index.ts';
import { type IncomingEmail, processAlertEmail } from '../intake/pipeline.ts';
import { listAccounts } from './accounts.ts';
import { ensureUser } from './users.ts';
import { storeRates } from '../rates/store.ts';

export const SENDERS = {
  opay: 'no-reply@opay-nigeria.com',
  moniepoint: 'no-reply@moniepoint.com',
  gtbank: 'GeNS@gtbank.com',
};

export function sample(name: string): string {
  return readFileSync(
    new URL(`../../../shared/sample-alerts/${name}.txt`, import.meta.url),
    'utf8',
  );
}

export function alter(text: string, replacements: Record<string, string>): string {
  let out = text;
  for (const [from, to] of Object.entries(replacements)) out = out.replaceAll(from, to);
  return out;
}

export type Fixture = {
  db: Db;
  user: User;
  accounts: Record<string, Account>;
  send: (
    email: Partial<IncomingEmail> & Pick<IncomingEmail, 'from' | 'subject' | 'text'>,
  ) => ReturnType<typeof processAlertEmail>;
};

/**
 * A fresh in-memory database with one user whose bank accounts are tracked from `trackingFrom`
 * and numbered so the sample alerts find them. Rates are fixed at ₦1,500 per dollar.
 */
export async function fixture(
  options: {
    trackingFrom?: string;
    numbers?: Record<string, string | null>;
  } = {},
): Promise<Fixture> {
  const db = await openDb({ dataDir: 'memory://' });
  await storeRates(db, '2026-01-01', { NGN: 1500, GBP: 0.78, EUR: 0.92 });
  const user = await ensureUser(db, 'test@example.com');
  const numbers: Record<string, string | null> = {
    opay: null,
    moniepoint: '6600000001',
    gtbank: '0123450001',
    uba: '2045670001',
    ...options.numbers,
  };
  for (const account of await listAccounts(db, user.id)) {
    if (account.bank === 'cash') continue;
    await db.query(
      `update accounts set tracked = true, tracking_from = $2::timestamptz, account_number = $3
       where id = $1::uuid`,
      [
        account.id,
        options.trackingFrom ?? '2026-09-01T00:00:00+01:00',
        numbers[account.bank] ?? null,
      ],
    );
  }
  const accounts = Object.fromEntries((await listAccounts(db, user.id)).map((a) => [a.bank, a]));
  let counter = 0;
  const send: Fixture['send'] = (email) =>
    processAlertEmail(db, user, {
      userId: user.id,
      messageId: email.messageId ?? `msg-${(counter += 1)}`,
      receivedAt: email.receivedAt ?? '2026-10-08T12:00:00Z',
      authenticated: email.authenticated ?? true,
      from: email.from,
      subject: email.subject,
      text: email.text,
    });
  return { db, user, accounts, send };
}
