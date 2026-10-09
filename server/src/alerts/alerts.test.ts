import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseAlert } from './index.ts';

// Each sample pins one bank layout. When a bank changes its email, the matching test fails here
// instead of transactions going missing in production.
const sample = (name: string) =>
  readFileSync(new URL(`../../../shared/sample-alerts/${name}.txt`, import.meta.url), 'utf8');

test('OPay transfer', () => {
  const result = parseAlert({
    from: 'no-reply@opay-nigeria.com',
    subject: 'Transfer Successful',
    text: sample('opay-transfer'),
  });
  assert.deepEqual(result, {
    ok: true,
    alert: {
      bank: 'opay',
      direction: 'debit',
      amountMinor: 5_000_000,
      currency: 'NGN',
      occurredAt: '2026-09-19T22:37:34+01:00',
      account: null,
      balanceAfterMinor: 10_671_647,
      reference: '260919010100000000000001',
      channel: 'transfer',
      counterparty: { name: 'ADA EXAMPLE OKORO', bank: 'OPay', account: '8100000001' },
      description: 'Transfer to ADA EXAMPLE OKORO',
    },
  });
});

test('OPay payment names the processor, not the shop', () => {
  const result = parseAlert({
    from: 'no-reply@opay-nigeria.com',
    subject: 'Payment Successful',
    text: sample('opay-payment'),
  });
  assert.deepEqual(result, {
    ok: true,
    alert: {
      bank: 'opay',
      direction: 'debit',
      amountMinor: 241_300,
      currency: 'NGN',
      occurredAt: '2026-09-28T13:41:55+01:00',
      account: null,
      balanceAfterMinor: 2_404_134,
      reference: '260928140300000000000002',
      channel: 'payment',
      counterparty: { name: 'Paystack Payment Limited', bank: null, account: null },
      description: 'Payment to Paystack Payment Limited (order paystack_0000000001_abcde)',
    },
  });
});

test('Moniepoint debit splits the recipient from their bank', () => {
  const result = parseAlert({
    from: 'no-reply@moniepoint.com',
    subject: 'Debit alert!',
    text: sample('moniepoint-debit'),
  });
  assert.deepEqual(result, {
    ok: true,
    alert: {
      bank: 'moniepoint',
      direction: 'debit',
      amountMinor: 12_000_000,
      currency: 'NGN',
      occurredAt: '2026-10-06T16:00:10+01:00',
      account: '6600000001',
      balanceAfterMinor: 68_428_947,
      counterparty: {
        name: 'BOLA SAMPLE ADEYEMI',
        bank: 'Guaranty Trust Bank',
        account: '*****00001',
      },
      description:
        'TRANSFER TO BOLA SAMPLE ADEYEMI Guaranty Trust Bank *****00001/TRF|2MPTsample|2100000000000000001',
      reference: 'TRF|2MPTsample|2100000000000000001',
      channel: 'transfer',
    },
  });
});

test('GTBank card purchase', () => {
  const result = parseAlert({
    from: 'GeNS@gtbank.com',
    subject: 'Transaction Notification',
    text: sample('gtbank-debit-card'),
  });
  assert.deepEqual(result, {
    ok: true,
    alert: {
      bank: 'gtbank',
      direction: 'debit',
      amountMinor: 668_500,
      currency: 'NGN',
      occurredAt: '2026-10-03T20:36:47+01:00',
      account: '******0001',
      balanceAfterMinor: 8_372_449,
      counterparty: null,
      description: 'WEB PUR SAMPLE CLOUD A1B2C3 CC SAMPLE COM IE 000001 600000000001 WPGTID01',
      reference: '000001',
      channel: 'card',
    },
  });
});

test('GTBank incoming transfer', () => {
  const result = parseAlert({
    from: 'GeNS@gtbank.com',
    subject: 'Transaction Notification',
    text: sample('gtbank-credit-transfer'),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.alert.direction, 'credit');
  assert.equal(result.alert.amountMinor, 5_000_000);
  assert.equal(result.alert.occurredAt, '2026-09-14T17:56:38+01:00');
  assert.equal(result.alert.channel, 'transfer');
});

test('a bank email with an unknown layout is flagged, not dropped', () => {
  const result = parseAlert({
    from: 'no-reply@opay-nigeria.com',
    subject: 'Money Received',
    text: 'You received ₦5,000.00',
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'unrecognised_layout');
});

test('mail from an address no parser owns is rejected', () => {
  const result = parseAlert({
    from: 'GTBank <alerts@gtbank-secure.example>',
    subject: 'Transaction Notification',
    text: sample('gtbank-debit-card'),
  });
  assert.deepEqual(result, {
    ok: false,
    reason: 'unknown_sender',
    detail: 'alerts@gtbank-secure.example',
  });
});
