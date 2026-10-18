import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, sample, SENDERS } from '../ledger/testing.ts';
import { getTransaction } from '../ledger/transactions.ts';
import { listAlerts, rerunAlerts } from './pipeline.ts';

// Emails kept before their layout was supported, as an older server would have stored them.
async function keep(
  db: Awaited<ReturnType<typeof fixture>>['db'],
  userId: string,
  row: { id: string; from: string; subject: string; text: string; status: string },
) {
  await db.query(
    `insert into raw_alerts (user_id, message_id, received_at, sender, subject, body_text, status)
     values ($1, $2, '2026-10-16T15:20:16Z', $3, $4, $5, $6)`,
    [userId, row.id, row.from, row.subject, row.text, row.status],
  );
}

test('a re-run logs the alerts a parser fix can now read and leaves the rest listed', async () => {
  const { db, user } = await fixture();
  await keep(db, user.id, {
    id: 'funding',
    from: SENDERS.grey,
    subject: 'Wallet Funding Successful',
    text: sample('grey-wallet-funded'),
    status: 'unknown_sender',
  });
  await keep(db, user.id, {
    id: 'mystery',
    from: SENDERS.grey,
    subject: 'You received a payment',
    text: 'Hi!',
    status: 'unrecognised_layout',
  });
  await keep(db, user.id, {
    id: 'login',
    from: SENDERS.moniepoint,
    subject: 'Moniepoint Successful Login',
    text: 'Welcome back!',
    status: 'not_a_transaction',
  });

  const before = await listAlerts(db, user.id, 'failed');
  assert.deepEqual(before.map((a) => a.subject).sort(), [
    'Wallet Funding Successful',
    'You received a payment',
  ]);

  assert.deepEqual(await rerunAlerts(db, user), { checked: 2, logged: 1 });

  const after = await listAlerts(db, user.id, 'failed');
  assert.deepEqual(
    after.map((a) => a.subject),
    ['You received a payment'],
  );
  const funding = (await listAlerts(db, user.id, 'all')).find(
    (a) => a.subject === 'Wallet Funding Successful',
  )!;
  assert.equal(funding.status, 'parsed');
  const logged = await getTransaction(db, user, funding.transactionId!);
  assert.equal(logged.type, 'income');
  assert.equal(logged.amountMinor, 269_800);
  assert.equal(logged.currency, 'USD');

  // Nothing new to read: a second run changes nothing and creates no duplicate.
  assert.deepEqual(await rerunAlerts(db, user), { checked: 1, logged: 0 });
});
