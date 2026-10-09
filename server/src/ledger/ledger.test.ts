import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listGaps } from './gaps.ts';
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

test('a debit to one of my own accounts (masked) is a transfer, and its credit joins it', async () => {
  // The Moniepoint alert names GTBank *****00001; the GTBank account ends with those digits.
  const { db, user, send } = await fixture({ numbers: { gtbank: '0123400001' } });
  const debit = await send({
    from: SENDERS.moniepoint,
    subject: 'Debit alert!',
    text: sample('moniepoint-debit'),
  });
  const leg1 = await getTransaction(db, user, debit.transactionId!);
  assert.equal(leg1.type, 'transfer');
  assert.ok(leg1.transferGroupId);

  const credit = await send({
    from: SENDERS.gtbank,
    subject: 'Transaction Notification',
    text: gtbankCredit({
      'NGN 50000': 'NGN 120000',
      '2026-09-14': '2026-10-06',
      '5:56:38 PM': '4:00:40 PM',
    }),
  });
  const leg2 = await getTransaction(db, user, credit.transactionId!);
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

test('balance check: a small drop is a fee, a big one is a gap, out of order is skipped', async () => {
  const { db, user, accounts, send } = await fixture();
  // Opening balance ₦106,716.47 after a ₦50,000 transfer.
  await send({ from: SENDERS.opay, subject: 'Transfer Successful', text: sample('opay-transfer') });

  // ₦2,413 payment, balance ₦50 lower than expected: a fee.
  const feeAlert = await send({
    from: SENDERS.opay,
    subject: 'Payment Successful',
    text: alter(sample('opay-payment'), {
      '₦24,041.34': '₦104,253.47',
      'Sep 28th, 2026 13:41:55': 'Sep 20th, 2026 09:00:00',
      '260928140300000000000002': '260920090000000000000002',
    }),
  });
  assert.equal(feeAlert.status, 'parsed');
  const fees = (await listTransactions(db, user, {})).transactions.filter((t) => t.isFee);
  assert.equal(fees.length, 1);
  assert.equal(fees[0]!.amountMinor, 5_000);
  assert.equal(fees[0]!.type, 'expense');
  assert.equal(fees[0]!.categoryName, 'Fees');
  assert.equal(fees[0]!.title, 'Bank fee');

  // Another ₦2,413 payment but the balance is ₦80,000 lower than expected: a gap.
  await send({
    from: SENDERS.opay,
    subject: 'Payment Successful',
    text: alter(sample('opay-payment'), {
      '₦24,041.34': '₦24,040.47',
      'Sep 28th, 2026 13:41:55': 'Sep 21st, 2026 09:00:00',
      '260928140300000000000002': '260921090000000000000003',
    }),
  });
  const gaps = await listGaps(db, user.id, 'open');
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0]!.accountId, accounts.opay!.id);
  assert.equal(gaps[0]!.expectedBalanceMinor, 10_425_347 - 241_300);
  assert.equal(gaps[0]!.actualBalanceMinor, 2_404_047);
  assert.equal(gaps[0]!.differenceMinor, 2_404_047 - (10_425_347 - 241_300));
  assert.equal(gaps[0]!.fromAt, new Date('2026-09-20T09:00:00+01:00').toISOString());

  // The original Sep 19 payment sample arrives late: older than the last balance, so no check.
  await send({
    from: SENDERS.opay,
    subject: 'Payment Successful',
    text: alter(sample('opay-payment'), { 'Sep 28th, 2026 13:41:55': 'Sep 19th, 2026 23:00:00' }),
  });
  assert.equal((await listGaps(db, user.id, 'open')).length, 1);
  assert.equal(
    (await listTransactions(db, user, {})).transactions.filter((t) => t.isFee).length,
    1,
  );
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
