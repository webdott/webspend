import assert from 'node:assert/strict';
import type { ImportCommitRequest } from '@webspend/shared';
import { test } from 'node:test';
import { listCategories } from '../ledger/categories.ts';
import { monthSummary } from '../ledger/summary.ts';
import { fixture, sample, SENDERS } from '../ledger/testing.ts';
import { listTransactions } from '../ledger/transactions.ts';
import { parseCsv } from './csv.ts';
import { parseDate } from './dates.ts';
import { commitImport, previewImport } from './index.ts';

const CSV = `﻿Date,Narration,Debit,Credit,Reference,Balance\r
03/10/2026 08:15,"POS PURCHASE, SHOPRITE",6685.00,,REF001,83724.49\r
04/10/2026,TRANSFER FROM ACME,,50000,REF002,133724.49\r
05/10/2026,"Line one\nline two",1200,,,132524.49\r
not a date,Broken row,10,,,0\r
`;

test('CSV preview guesses the mapping and flags ambiguous dates', () => {
  const preview = previewImport({ accountId: 'x', format: 'csv', content: CSV });
  assert.deepEqual(preview.columns, [
    'Date',
    'Narration',
    'Debit',
    'Credit',
    'Reference',
    'Balance',
  ]);
  assert.equal(preview.rowCount, 4);
  assert.deepEqual(preview.suggestedMapping, {
    columns: {
      Date: 'date',
      Narration: 'description',
      Debit: 'debit',
      Credit: 'credit',
      Reference: 'reference',
      Balance: 'balance',
    },
    dateOrder: 'dmy',
    negativeIsExpense: true,
  });
  assert.equal(preview.dateAmbiguous, true);
  assert.equal(preview.sampleRows[2]!.Narration, 'Line one\nline two');
});

test('a day above twelve settles the order and nothing is ambiguous', () => {
  const preview = previewImport({
    accountId: 'x',
    format: 'csv',
    content: 'date,amount\n25/10/2026,-500\n03/10/2026,-10\n',
  });
  assert.equal(preview.dateAmbiguous, false);
  assert.equal(preview.suggestedMapping.dateOrder, 'dmy');
  assert.equal(parseCsv('a,b\n"x ""y""",2').rows[0]!.a, 'x "y"');
});

test('dates in the common statement formats read as Lagos time', () => {
  assert.equal(parseDate('2026-10-03', 'dmy'), '2026-10-03T00:00:00+01:00');
  assert.equal(parseDate('03/10/2026 14:05', 'dmy'), '2026-10-03T14:05:00+01:00');
  assert.equal(parseDate('03/10/2026', 'mdy'), '2026-03-10T00:00:00+01:00');
  assert.equal(parseDate('03-10-2026 2:05:09 PM', 'dmy'), '2026-10-03T14:05:09+01:00');
  assert.equal(parseDate('3 Oct 2026', 'dmy'), '2026-10-03T00:00:00+01:00');
  assert.equal(parseDate('Oct 3, 2026 09:30', 'dmy'), '2026-10-03T09:30:00+01:00');
  assert.equal(parseDate('2026-10-03T20:36:47+01:00', 'dmy'), '2026-10-03T20:36:47+01:00');
  assert.equal(parseDate('2026-10-03T19:36:47Z', 'dmy'), '2026-10-03T19:36:47Z');
  assert.equal(parseDate('31/02/2026', 'dmy'), null);
  assert.equal(parseDate('hello', 'dmy'), null);
});

test('committing a CSV adds rows, skips duplicates and reports bad rows', async () => {
  const { db, user, accounts } = await fixture();
  const gtbank = accounts.gtbank!;
  const preview = previewImport({ accountId: gtbank.id, format: 'csv', content: CSV });
  const request = {
    accountId: gtbank.id,
    format: 'csv' as const,
    content: CSV,
    mapping: preview.suggestedMapping,
  };

  const first = await commitImport(db, user, request);
  assert.equal(first.added, 3);
  assert.equal(first.skipped, 0);
  assert.deepEqual(first.errors, [{ row: 4, reason: 'unreadable date "not a date"' }]);
  const { transactions } = await listTransactions(db, user, { accountId: gtbank.id });
  assert.equal(transactions.length, 3);
  const pos = transactions.find((t) => t.bankReference === 'REF001')!;
  assert.equal(pos.type, 'expense');
  assert.equal(pos.amountMinor, 668_500);
  assert.equal(pos.occurredAt, new Date('2026-10-03T08:15:00+01:00').toISOString());
  assert.equal(pos.title, 'POS PURCHASE, SHOPRITE');
  assert.equal(pos.source, 'import');
  assert.equal(transactions.find((t) => t.bankReference === 'REF002')!.type, 'income');

  const again = await commitImport(db, user, request);
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 3);
});

test('a statement row with a shortened narration and no reference matches the alert it repeats', async () => {
  const { db, user, accounts } = await fixture();
  const gtbank = accounts.gtbank!;
  const alertLike = await commitImport(db, user, {
    accountId: gtbank.id,
    format: 'json',
    content: JSON.stringify([
      {
        date: '2026-10-03T20:36:47+01:00',
        amount: -6685,
        description: 'WEB PUR SAMPLE CLOUD A1B2C3 CC SAMPLE COM IE 000001 600000000001 WPGTID01',
        reference: '000001',
      },
      { date: '2026-10-03T09:00:00+01:00', amount: -6685, description: 'POS FUEL STATION' },
    ]),
    mapping: {
      columns: {
        date: 'date',
        amount: 'amount',
        description: 'description',
        reference: 'reference',
      },
      dateOrder: 'ymd',
      negativeIsExpense: true,
    },
  });
  assert.equal(alertLike.added, 2);

  const statement = await commitImport(db, user, {
    accountId: gtbank.id,
    format: 'csv',
    content:
      'Date,Narration,Debit\n03/10/2026,WEB PUR SAMPLE CLOUD,6685.00\n03/10/2026,AIRTIME,6685.00\n',
    mapping: {
      columns: { Date: 'date', Narration: 'description', Debit: 'debit' },
      dateOrder: 'dmy',
      negativeIsExpense: true,
    },
  });
  // The shortened narration is the alert's prefix, so it is skipped; the airtime row is new.
  assert.equal(statement.skipped, 1);
  assert.equal(statement.added, 1);
});

test('identical rows in one statement are all kept, then all skipped on a re-import', async () => {
  const { db, user, accounts } = await fixture();
  const request: ImportCommitRequest = {
    accountId: accounts.gtbank!.id,
    format: 'csv',
    content: 'Date,Narration,Debit\n03/10/2026,AIRTIME,100.00\n03/10/2026,AIRTIME,100.00\n',
    mapping: {
      columns: { Date: 'date', Narration: 'description', Debit: 'debit' },
      dateOrder: 'dmy',
      negativeIsExpense: true,
    },
  };
  const first = await commitImport(db, user, request);
  assert.deepEqual([first.added, first.skipped], [2, 0]);
  const again = await commitImport(db, user, request);
  assert.deepEqual([again.added, again.skipped], [0, 2]);
});

test('an imported credit still pairs with the alert that sent it from another own account', async () => {
  const { db, user, accounts, send } = await fixture();
  const debit = await send({
    from: SENDERS.moniepoint,
    subject: 'Debit alert!',
    text: sample('moniepoint-debit'),
  });
  await commitImport(db, user, {
    accountId: accounts.gtbank!.id,
    format: 'csv',
    content: 'Date,Narration,Credit\n06/10/2026 16:05,NIP TRANSFER,120000.00\n',
    mapping: {
      columns: { Date: 'date', Narration: 'description', Credit: 'credit' },
      dateOrder: 'dmy',
      negativeIsExpense: true,
    },
  });
  const { transactions } = await listTransactions(db, user, {});
  const sent = transactions.find((t) => t.id === debit.transactionId)!;
  const received = transactions.find((t) => t.source === 'import')!;
  assert.equal(received.type, 'transfer');
  assert.equal(received.transferGroupId, sent.transferGroupId);
});

test('a JSON import with a single signed amount column', async () => {
  const { db, user, accounts } = await fixture();
  const content = JSON.stringify({
    transactions: [
      {
        date: '2026-10-03T10:00:00+01:00',
        amount: '-2,413.00',
        details: 'Paystack',
        payee: 'Paystack Payment Limited',
        ref: 'A1',
      },
      {
        date: '2026-10-04T10:00:00+01:00',
        amount: 5000,
        details: 'Refund',
        payee: null,
        ref: 'A2',
      },
      { date: '2026-10-04T10:00:00+01:00', amount: 0, details: 'Nothing', payee: null, ref: 'A3' },
    ],
  });
  const preview = previewImport({ accountId: accounts.opay!.id, format: 'json', content });
  assert.deepEqual(preview.suggestedMapping.columns, {
    date: 'date',
    amount: 'amount',
    details: 'description',
    payee: 'counterparty',
    ref: 'reference',
  });
  assert.equal(preview.dateAmbiguous, false);
  const result = await commitImport(db, user, {
    accountId: accounts.opay!.id,
    format: 'json',
    content,
    mapping: preview.suggestedMapping,
  });
  assert.equal(result.added, 2);
  assert.deepEqual(result.errors, [{ row: 3, reason: 'the amount is zero' }]);
  const { transactions } = await listTransactions(db, user, {});
  const paystack = transactions.find((t) => t.bankReference === 'A1')!;
  assert.equal(paystack.type, 'expense');
  assert.equal(paystack.amountMinor, 241_300);
  assert.equal(paystack.title, 'Paystack Payment Limited');
  assert.equal(transactions.find((t) => t.bankReference === 'A2')!.type, 'income');
});

test('a category column creates the missing categories, files the rows and carries the month over', async () => {
  const { db, user, accounts } = await fixture();
  const gtbank = accounts.gtbank!;
  const content = `Date, Category, Amount, Note
09/10/2026, Eating Out, -11000, 
09/10/2026, Shopping, -25000, Gym shirt
07/10/2026, Miscellaneous , -2000, Printing of passport
08/10/2026, eating out, -10750, 
20/09/2026, Salary, 100000, September pay
21/09/2026, Shopping, -30000, Shoes
`;
  const preview = previewImport({ accountId: gtbank.id, format: 'csv', content });
  assert.equal(preview.suggestedMapping.columns.Category, 'category');
  const request: ImportCommitRequest = {
    accountId: gtbank.id,
    format: 'csv',
    content,
    mapping: preview.suggestedMapping,
  };

  const first = await commitImport(db, user, request);
  assert.deepEqual(
    [first.added, first.skipped, first.categoriesCreated, first.errors.length],
    [6, 0, 4, 0],
  );
  const names = (await listCategories(db, user.id)).map((category) => category.name);
  for (const name of ['Eating Out', 'Shopping', 'Miscellaneous', 'Salary']) {
    assert.ok(names.includes(name), name);
  }
  const { transactions } = await listTransactions(db, user, { month: '2026-10' });
  assert.deepEqual(transactions.map((t) => `${t.amountMinor / 100} ${t.categoryName}`).sort(), [
    '10750 Eating Out',
    '11000 Eating Out',
    '2000 Miscellaneous',
    '25000 Shopping',
  ]);

  await db.query('update transactions set category_id = null where user_id = $1', [user.id]);
  const again = await commitImport(db, user, request);
  assert.deepEqual(
    [again.added, again.skipped, again.categoriesCreated, again.categorised],
    [0, 6, 0, 6],
  );

  const october = await monthSummary(db, user, '2026-10');
  assert.equal(october.carryOverMinor, 7_000_000);
  assert.equal(october.availableMinor, 7_000_000 - 4_875_000);
  assert.equal((await monthSummary(db, user, '2026-09')).carryOverMinor, 0);
});
