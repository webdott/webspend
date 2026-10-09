/**
 * Demo data for development: `pnpm seed`. Creates the dev user with tracked accounts, runs the
 * sample alerts through intake and adds hand-made October entries so the summary looks like the
 * mockup. Re-running wipes and recreates that user's data.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { User } from '@webspend/shared';
import { loadConfig, loadDotEnv } from '../config.ts';
import type { Db } from '../db/index.ts';
import { openConfiguredDb } from '../db/open.ts';
import { processAlertEmail } from '../intake/pipeline.ts';
import { listAccounts } from '../ledger/accounts.ts';
import { listCategories } from '../ledger/categories.ts';
import { type RecordInput, recordTransaction } from '../ledger/record.ts';
import { ensureUser, updateSettings } from '../ledger/users.ts';
import { storeRates } from '../rates/store.ts';

const TRACKING_FROM = '2026-09-01T00:00:00+01:00';
const RATES = { NGN: 1500, GBP: 0.78, EUR: 0.92 };

const SAMPLES = [
  { file: 'gtbank-credit-transfer', from: 'GeNS@gtbank.com', subject: 'Transaction Notification' },
  { file: 'opay-transfer', from: 'no-reply@opay-nigeria.com', subject: 'Transfer Successful' },
  { file: 'opay-payment', from: 'no-reply@opay-nigeria.com', subject: 'Payment Successful' },
  { file: 'gtbank-debit-card', from: 'GeNS@gtbank.com', subject: 'Transaction Notification' },
  { file: 'moniepoint-debit', from: 'no-reply@moniepoint.com', subject: 'Debit alert!' },
];

const ACCOUNT_NUMBERS: Record<string, string> = {
  opay: '8123450001',
  moniepoint: '6600000001',
  gtbank: '0123450001',
  uba: '2045670001',
};

export async function seed(db: Db, email: string): Promise<User> {
  await db.query('delete from users where email = $1', [email]);
  // One early row per currency; lookups fall back to the nearest earlier day.
  await storeRates(db, '2026-08-01', RATES, 'seed');

  let user = await ensureUser(db, email);
  user = await updateSettings(db, user.id, { monthlyBudgetMinor: 120_000_000 });

  for (const account of await listAccounts(db, user.id)) {
    if (account.bank === 'cash') continue;
    await db.query(
      `update accounts set tracked = true, tracking_from = $2::timestamptz, account_number = $3
       where id = $1::uuid`,
      [account.id, TRACKING_FROM, ACCOUNT_NUMBERS[account.bank] ?? null],
    );
  }
  const accounts = Object.fromEntries((await listAccounts(db, user.id)).map((a) => [a.bank, a]));
  const categories = Object.fromEntries(
    (await listCategories(db, user.id)).map((c) => [c.name, c]),
  );
  const account = (bank: string) => accounts[bank]!.id;
  const category = (name: string) => categories[name]!.id;

  for (const sample of SAMPLES) {
    const text = readFileSync(
      new URL(`../../../shared/sample-alerts/${sample.file}.txt`, import.meta.url),
      'utf8',
    );
    await processAlertEmail(db, user, {
      userId: user.id,
      messageId: `seed-${sample.file}`,
      from: sample.from,
      subject: sample.subject,
      text,
      receivedAt: new Date().toISOString(),
      authenticated: true,
    });
  }
  await db.query(
    `update transactions set user_description = 'Cloud hosting', category_id = $2::uuid
     where user_id = $1 and bank_description like 'WEB PUR SAMPLE CLOUD%'`,
    [user.id, category('Subscriptions')],
  );

  const manual = (input: Omit<RecordInput, 'source'>) =>
    recordTransaction(db, user, { source: 'manual', ...input });
  const imported = (input: Omit<RecordInput, 'source'>) =>
    recordTransaction(db, user, { source: 'import', ...input });

  await manual({
    accountId: account('moniepoint'),
    occurredAt: '2026-10-01T09:14:00+01:00',
    type: 'expense',
    amountMinor: 1_850_000,
    currency: 'NGN',
    userDescription: 'Corner Mart',
    categoryId: category('Food & groceries'),
  });
  await manual({
    accountId: account('opay'),
    occurredAt: '2026-10-02T18:40:00+01:00',
    type: 'expense',
    amountMinor: 450_000,
    currency: 'NGN',
    userDescription: 'Ride to Ikeja',
    categoryId: category('Transport'),
  });
  await manual({
    accountId: account('moniepoint'),
    occurredAt: '2026-10-04T08:05:00+01:00',
    type: 'expense',
    amountMinor: 200_000,
    currency: 'NGN',
    userDescription: 'Airtime top-up',
    categoryId: category('Data & airtime'),
  });
  await manual({
    accountId: account('gtbank'),
    occurredAt: '2026-10-05T17:22:00+01:00',
    type: 'expense',
    amountMinor: 3_500_000,
    currency: 'NGN',
    userDescription: 'Fuel station',
    categoryId: category('Transport'),
  });
  await manual({
    accountId: account('gtbank'),
    occurredAt: '2026-10-01T10:00:00+01:00',
    type: 'expense',
    amountMinor: 45_000_000,
    currency: 'NGN',
    userDescription: 'October rent',
    counterpartyName: 'Landlord',
    categoryId: category('Rent & housing'),
  });

  await imported({
    accountId: account('grey'),
    occurredAt: '2026-10-01T15:30:00+01:00',
    type: 'income',
    direction: 'credit',
    amountMinor: 200_000,
    currency: 'USD',
    counterpartyName: 'Acme Ltd',
    bankDescription: 'Payment from Acme Ltd',
    bankReference: 'GREY-ACME-2026-10',
  });

  // Grey converts $500 to naira for GTBank. The official rate says ₦750,000, ₦735,000 arrives,
  // so the pairing rule logs the ₦15,000 shortfall as an exchange loss.
  await imported({
    accountId: account('grey'),
    occurredAt: '2026-10-03T11:00:00+01:00',
    type: 'expense',
    direction: 'debit',
    amountMinor: 50_000,
    currency: 'USD',
    bankDescription: 'Withdrawal to GTBank 0123450001',
    bankReference: 'GREY-WD-000123',
  });
  await imported({
    accountId: account('gtbank'),
    occurredAt: '2026-10-03T11:20:00+01:00',
    type: 'income',
    direction: 'credit',
    amountMinor: 73_500_000,
    currency: 'NGN',
    bankDescription: 'TRANSFER FROM GREY FINANCE/GREY-WD-000123',
    bankReference: 'GREY-WD-000123',
  });

  await imported({
    accountId: account('opay'),
    occurredAt: '2026-10-07T13:05:00+01:00',
    type: 'expense',
    direction: 'debit',
    amountMinor: 1_299_000,
    currency: 'NGN',
    counterpartyName: 'Paystack Payment Limited',
    bankDescription: 'Payment to Paystack Payment Limited (order paystack_0000000002_fghij)',
    bankReference: '261007130500000000000003',
  });

  return user;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadDotEnv();
  const config = loadConfig();
  const email = process.env.DEV_EMAIL || 'dev@webspend.local';
  const db = await openConfiguredDb(config);
  try {
    await seed(db, email);
    console.log(`seeded. sign in with: ${email}`);
    console.log(
      `  curl -s -X POST localhost:${config.port}/auth/dev -H 'content-type: application/json' -d '{"email":"${email}"}'`,
    );
  } finally {
    await db.close();
  }
}
