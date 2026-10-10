import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Transaction } from '@webspend/shared';
import { fixture, sample, SENDERS } from '../ledger/testing.ts';
import { transactionsCsv } from './csv.ts';
import { buildExport, exportRange } from './index.ts';

const NGN = { defaultCurrency: 'NGN' as const };

function entry(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    occurredAt: '2026-10-03T19:36:47.000Z',
    type: 'expense',
    amountMinor: 668_500,
    currency: 'NGN',
    defaultMinor: 668_500,
    defaultCurrency: 'NGN',
    usdMinor: 446,
    fxPerUsd: 1500,
    accountId: 'a1',
    accountName: 'GTBank',
    bank: 'gtbank',
    title: 'Cloud hosting',
    userTitle: null,
    counterpartyName: null,
    counterpartyBank: null,
    counterpartyAccount: null,
    bankDescription: null,
    userDescription: null,
    categoryId: null,
    categoryName: 'Subscriptions',
    source: 'alert',
    bankReference: null,
    transferGroupId: null,
    isFee: false,
    unsureTransfer: false,
    createdAt: '2026-10-03T19:36:50.000Z',
    ...overrides,
  };
}

test('the range defaults to the month of its end day', () => {
  assert.deepEqual(exportRange({}, '2026-10-09'), { from: '2026-10-01', to: '2026-10-09' });
  assert.deepEqual(exportRange({ from: '2026-09-15' }, '2026-10-09'), {
    from: '2026-09-15',
    to: '2026-10-09',
  });
  assert.deepEqual(exportRange({ from: '2026-01-01', to: '2026-03-31' }, '2026-10-09'), {
    from: '2026-01-01',
    to: '2026-03-31',
  });
});

test('CSV rows are Lagos-dated, signed decimals, and quoted only when needed', () => {
  const csv = transactionsCsv(
    [
      entry({}),
      entry({
        id: 't2',
        type: 'income',
        amountMinor: 200_000,
        defaultMinor: 300_000_000,
        usdMinor: 200_000,
        currency: 'USD',
        title: 'Acme, "October" invoice',
        userDescription: '=SUM(A1)',
        categoryName: null,
        bank: 'grey',
        accountName: 'Grey',
      }),
    ],
    NGN,
  );
  const lines = csv.split('\r\n');
  assert.ok(csv.startsWith('﻿'), 'starts with a byte-order mark');
  assert.equal(
    lines[0]!.slice(1),
    'Date,Time,Type,Title,Description,Category,Account,Bank,Amount,Currency,Amount (NGN),USD equivalent,Counterparty,Reference,Source',
  );
  assert.equal(
    lines[1],
    '2026-10-03,20:36,Expense,Cloud hosting,,Subscriptions,GTBank,GTBank,-6685.00,NGN,-6685.00,-4.46,,,Bank alert',
  );
  assert.equal(
    lines[2],
    `2026-10-03,20:36,Income,"Acme, ""October"" invoice",'=SUM(A1),,Grey,Grey,2000.00,USD,3000000.00,2000.00,,,Bank alert`,
  );
  assert.equal(lines.at(-1), '');
});

test('an export covers exactly the days asked for, newest first, in both formats', async () => {
  const { db, user, send } = await fixture();
  await send({ from: SENDERS.opay, subject: 'Transfer Successful', text: sample('opay-transfer') }); // 19 Sep
  await send({
    from: SENDERS.gtbank,
    subject: 'Transaction Notification',
    text: sample('gtbank-debit-card'),
  }); // 3 Oct
  await send({
    from: SENDERS.moniepoint,
    subject: 'Debit alert!',
    text: sample('moniepoint-debit'),
  }); // 6 Oct

  const csv = await buildExport(db, user, { format: 'csv', from: '2026-10-01', to: '2026-10-31' });
  assert.equal(csv.filename, 'webspend-2026-10-01-to-2026-10-31.csv');
  assert.equal(csv.contentType, 'text/csv; charset=utf-8');
  const lines = new TextDecoder().decode(csv.body).replace('﻿', '').trim().split('\r\n');
  assert.equal(lines.length, 3, 'header plus the two October alerts');
  assert.match(
    lines[1]!,
    /^2026-10-06,16:00,Expense,BOLA SAMPLE ADEYEMI,.*,-120000.00,NGN,-120000.00,-80.00,BOLA SAMPLE ADEYEMI,/,
  );
  assert.match(lines[2]!, /^2026-10-03,20:36,Expense,WEB PUR SAMPLE CLOUD/);

  const single = await buildExport(db, user, {
    format: 'csv',
    from: '2026-10-06',
    to: '2026-10-06',
  });
  assert.equal(
    new TextDecoder().decode(single.body).trim().split('\r\n').length,
    2,
    'one day, one row',
  );

  const pdf = await buildExport(db, user, { format: 'pdf', from: '2026-09-01', to: '2026-10-31' });
  assert.equal(pdf.filename, 'webspend-2026-09-01-to-2026-10-31.pdf');
  assert.equal(pdf.contentType, 'application/pdf');
  assert.equal(new TextDecoder().decode(pdf.body.slice(0, 5)), '%PDF-');
  assert.ok(pdf.body.length > 5_000, `pdf is ${pdf.body.length} bytes`);
  // Three rows fit on one page. The footer must not push an empty page after it.
  assert.equal(pdfPageCount(pdf.body), 1);
});

function pdfPageCount(body: Uint8Array): number {
  return (
    Buffer.from(body)
      .toString('latin1')
      .match(/\/Type\s*\/Page[^s]/g) ?? []
  ).length;
}

test('a long export paginates the PDF without losing rows', async () => {
  const { db, user, accounts } = await fixture();
  const cash = accounts.cash!;
  for (let day = 1; day <= 60; day += 1) {
    const date = new Date(Date.UTC(2026, 7, 1 + day)).toISOString();
    await db.query(
      `insert into transactions (user_id, account_id, occurred_at, type, direction, amount_minor, currency, user_description, source)
       values ($1::uuid, $2::uuid, $3::timestamptz, 'expense', 'debit', 150000, 'NGN', $4, 'manual')`,
      [user.id, cash.id, date, `Lunch ${day}`],
    );
  }
  const pdf = await buildExport(db, user, { format: 'pdf', from: '2026-08-01', to: '2026-10-31' });
  // 60 rows at 30pt each need three pages, and the footers must not add a fourth.
  assert.equal(pdfPageCount(pdf.body), 3);
});
