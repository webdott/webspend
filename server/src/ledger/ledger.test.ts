import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rememberCategory } from './payees.ts';
import { recordTransaction } from './record.ts';
import { remarkTransaction } from './rules/remark.ts';
import { getTransaction, listTransactions } from './transactions.ts';
import { listCategories } from './categories.ts';
import { alter, fixture, sample, SENDERS } from './testing.ts';

const gtbankCredit = (overrides: Record<string, string>) =>
  alter(sample('gtbank-credit-transfer'), overrides);

test('the five sample alerts become the right transactions', async () => {
  const { db, user, send } = await fixture();
  const opay1 = await send({
    from: SENDERS.opay,
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  const opay2 = await send({
    from: SENDERS.opay,
    subject: 'Payment Successful',
    text: sample('opay-payment'),
  });
  const moniepoint = await send({
    from: SENDERS.moniepoint,
    subject: 'Debit alert!',
    text: sample('moniepoint-debit'),
  });
  const gtDebit = await send({
    from: SENDERS.gtbank,
    subject: 'Transaction Notification',
    text: sample('gtbank-debit-card'),
  });
  const gtCredit = await send({
    from: SENDERS.gtbank,
    subject: 'Transaction Notification',
    text: sample('gtbank-credit-transfer'),
  });

  for (const alert of [opay1, opay2, moniepoint, gtDebit, gtCredit]) {
    assert.equal(alert.status, 'parsed', alert.detail ?? '');
    assert.ok(alert.transactionId);
  }
  const { transactions } = await listTransactions(db, user, {});
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const t1 = byId.get(opay1.transactionId!)!;
  assert.equal(t1.type, 'expense');
  assert.equal(t1.amountMinor, 5_000_000);
  assert.equal(t1.title, 'ADA EXAMPLE OKORO');
  assert.equal(t1.usdMinor, Math.round(5_000_000 / 1500));
  assert.equal(t1.defaultMinor, 5_000_000);
  assert.equal(t1.fxPerUsd, 1500);
  assert.equal(byId.get(opay2.transactionId!)!.amountMinor, 241_300);
  assert.equal(byId.get(moniepoint.transactionId!)!.type, 'expense');
  assert.equal(byId.get(moniepoint.transactionId!)!.amountMinor, 12_000_000);
  assert.equal(byId.get(gtDebit.transactionId!)!.amountMinor, 668_500);
  const credit = byId.get(gtCredit.transactionId!)!;
  assert.equal(credit.type, 'income');
  assert.equal(credit.amountMinor, 5_000_000);
  assert.equal(credit.bank, 'gtbank');
  assert.equal(transactions.filter((t) => !t.isFee).length, 5);
});

test('an alert older than tracking_from is kept but not logged', async () => {
  const { db, user, send } = await fixture({ trackingFrom: '2026-09-20T00:00:00+01:00' });
  const alert = await send({
    from: SENDERS.opay,
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  assert.equal(alert.status, 'before_tracking_from');
  assert.equal(alert.transactionId, null);
  assert.equal((await listTransactions(db, user, {})).transactions.length, 0);
});

test('duplicates and unauthenticated mail never reach the ledger', async () => {
  const { db, user, send } = await fixture();
  const first = await send({
    messageId: 'same',
    from: SENDERS.opay,
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  const again = await send({
    messageId: 'same',
    from: SENDERS.opay,
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  assert.equal(again.status, 'duplicate');
  assert.equal(again.id, first.id);
  const fake = await send({
    authenticated: false,
    from: SENDERS.opay,
    subject: 'Payment Successful',
    text: sample('opay-payment'),
  });
  assert.equal(fake.status, 'failed_authentication');
  assert.equal((await listTransactions(db, user, {})).transactions.length, 1);
});

test('a full account number of mine makes a transfer; a last-digits match is only tagged unsure', async () => {
  const { db, user, accounts, send } = await fixture({ numbers: { gtbank: '0123400001' } });
  const own = await recordTransaction(db, user, {
    accountId: accounts.opay!.id,
    occurredAt: '2026-10-01T09:00:00+01:00',
    type: 'expense',
    amountMinor: 500_000,
    currency: 'NGN',
    counterpartyBank: 'Guaranty Trust Bank',
    counterpartyAccount: '0123400001',
    source: 'alert',
  });
  assert.equal(own.transaction.type, 'transfer');
  assert.equal(own.transaction.unsureTransfer, false);

  // The Moniepoint alert names GTBank *****00001; the GTBank account ends with those digits.
  const debit = await send({
    from: SENDERS.moniepoint,
    subject: 'Debit alert!',
    text: sample('moniepoint-debit'),
  });
  const leg1 = await getTransaction(db, user, debit.transactionId!);
  assert.equal(leg1.type, 'expense');
  assert.equal(leg1.unsureTransfer, true);
  assert.deepEqual(
    (await listTransactions(db, user, { unsure: true })).transactions.map((t) => t.id),
    [leg1.id],
  );

  await remarkTransaction(db, user.id, leg1.id, 'expense');
  assert.equal((await getTransaction(db, user, leg1.id)).unsureTransfer, false);
});

test('an unsure debit becomes a transfer when its credit arrives in my other account', async () => {
  const { db, user, send } = await fixture({ numbers: { gtbank: '0123400001' } });
  const debit = await send({
    from: SENDERS.moniepoint,
    subject: 'Debit alert!',
    text: sample('moniepoint-debit'),
  });
  assert.equal((await getTransaction(db, user, debit.transactionId!)).unsureTransfer, true);

  const credit = await send({
    from: SENDERS.gtbank,
    subject: 'Transaction Notification',
    text: gtbankCredit({
      'NGN 50000': 'NGN 120000',
      '2026-09-14': '2026-10-06',
      '5:56:38 PM': '4:00:40 PM',
    }),
  });
  const leg1 = await getTransaction(db, user, debit.transactionId!);
  const leg2 = await getTransaction(db, user, credit.transactionId!);
  assert.equal(leg1.type, 'transfer');
  assert.equal(leg1.unsureTransfer, false);
  assert.equal(leg2.type, 'transfer');
  assert.equal(leg2.transferGroupId, leg1.transferGroupId);
});

test('an equal and opposite amount minutes apart pairs into one transfer', async () => {
  const { db, user, send } = await fixture();
  const debit = await send({
    from: SENDERS.opay,
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  const credit = await send({
    from: SENDERS.gtbank,
    subject: 'Transaction Notification',
    text: gtbankCredit({ '2026-09-14': '2026-09-19', '5:56:38 PM': '10:40:00 PM' }),
  });
  const leg1 = await getTransaction(db, user, debit.transactionId!);
  const leg2 = await getTransaction(db, user, credit.transactionId!);
  assert.equal(leg1.type, 'transfer');
  assert.equal(leg2.type, 'transfer');
  assert.equal(leg1.transferGroupId, leg2.transferGroupId);
  assert.ok(leg1.transferGroupId);
});

test('an alert is logged under its bank even when two accounts there are tracked', async () => {
  const { db, user, accounts, send } = await fixture();
  await db.query(
    `insert into accounts (user_id, bank, name, tracked, tracking_from)
     values ($1, 'opay', 'OPay business', true, '2026-09-01T00:00:00+01:00')`,
    [user.id],
  );
  const alert = await send({
    from: SENDERS.opay,
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  assert.equal(alert.status, 'parsed');
  const logged = await getTransaction(db, user, alert.transactionId!);
  assert.equal(logged.accountId, accounts.opay!.id);
});

test('a remembered category is applied to the next alert from that payee', async () => {
  const { db, user, send } = await fixture();
  const categories = await listCategories(db, user.id);
  const subscriptions = categories.find((c) => c.name === 'Subscriptions')!;
  await rememberCategory(db, user.id, 'paystack payment limited', subscriptions.id);
  const alert = await send({
    from: SENDERS.opay,
    subject: 'Payment Successful',
    text: sample('opay-payment'),
  });
  const transaction = await getTransaction(db, user, alert.transactionId!);
  assert.equal(transaction.categoryId, subscriptions.id);
  assert.equal(transaction.categoryName, 'Subscriptions');
});

test('re-marking a transfer leg to expense frees both legs, and back to transfer re-pairs them', async () => {
  const { db, user, send } = await fixture();
  const debit = await send({
    from: SENDERS.opay,
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  const credit = await send({
    from: SENDERS.gtbank,
    subject: 'Transaction Notification',
    text: gtbankCredit({ '2026-09-14': '2026-09-19', '5:56:38 PM': '10:40:00 PM' }),
  });
  assert.equal((await getTransaction(db, user, debit.transactionId!)).type, 'transfer');

  await remarkTransaction(db, user.id, debit.transactionId!, 'expense');
  const freedDebit = await getTransaction(db, user, debit.transactionId!);
  const freedCredit = await getTransaction(db, user, credit.transactionId!);
  assert.equal(freedDebit.type, 'expense');
  assert.equal(freedDebit.transferGroupId, null);
  assert.equal(freedCredit.type, 'income');
  assert.equal(freedCredit.transferGroupId, null);

  await remarkTransaction(db, user.id, credit.transactionId!, 'transfer');
  const pairedDebit = await getTransaction(db, user, debit.transactionId!);
  const pairedCredit = await getTransaction(db, user, credit.transactionId!);
  assert.equal(pairedDebit.type, 'transfer');
  assert.equal(pairedCredit.type, 'transfer');
  assert.equal(pairedDebit.transferGroupId, pairedCredit.transferGroupId);
});

test('Grey dollars arriving as naira pair up and the shortfall is logged as an exchange loss', async () => {
  const { db, user, accounts } = await fixture();
  const usd = await recordTransaction(db, user, {
    accountId: accounts.grey!.id,
    occurredAt: '2026-10-03T11:00:00+01:00',
    type: 'expense',
    direction: 'debit',
    amountMinor: 50_000,
    currency: 'USD',
    bankDescription: 'Withdrawal to GTBank',
    source: 'import',
  });
  const ngn = await recordTransaction(db, user, {
    accountId: accounts.gtbank!.id,
    occurredAt: '2026-10-03T11:20:00+01:00',
    type: 'income',
    direction: 'credit',
    amountMinor: 73_500_000,
    currency: 'NGN',
    bankDescription: 'TRANSFER FROM GREY',
    source: 'import',
  });
  assert.equal(ngn.transfer.paired, true);
  const usdLeg = await getTransaction(db, user, usd.transaction.id);
  const ngnLeg = await getTransaction(db, user, ngn.transaction.id);
  assert.equal(usdLeg.type, 'transfer');
  assert.equal(ngnLeg.type, 'transfer');
  assert.equal(usdLeg.transferGroupId, ngnLeg.transferGroupId);
  assert.equal(usdLeg.defaultMinor, 75_000_000);
  const fee = (await listTransactions(db, user, {})).transactions.find((t) => t.isFee)!;
  assert.equal(fee.amountMinor, 1_500_000);
  assert.equal(fee.accountId, accounts.gtbank!.id);
  assert.equal(fee.title, 'Exchange loss & fees');
  assert.equal(fee.categoryName, 'Fees');
});

test('a dollar leg and a naira leg joined by their reference still log the exchange loss', async () => {
  const { db, user, accounts } = await fixture();
  await recordTransaction(db, user, {
    accountId: accounts.grey!.id,
    occurredAt: '2026-10-03T11:00:00+01:00',
    type: 'expense',
    direction: 'debit',
    amountMinor: 50_000,
    currency: 'USD',
    bankReference: 'GREY-WD-1',
    source: 'import',
  });
  const ngn = await recordTransaction(db, user, {
    accountId: accounts.gtbank!.id,
    occurredAt: '2026-10-05T11:20:00+01:00',
    type: 'income',
    direction: 'credit',
    amountMinor: 74_000_000,
    currency: 'NGN',
    bankReference: 'GREY-WD-1',
    source: 'import',
  });
  assert.equal(ngn.transfer.paired, true);
  assert.ok(ngn.transfer.paired && ngn.transfer.feeId);
  const fee = await getTransaction(db, user, ngn.transfer.paired ? ngn.transfer.feeId! : '');
  assert.equal(fee.amountMinor, 1_000_000);
  assert.equal(fee.isFee, true);
});
