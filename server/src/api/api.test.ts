import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Summary, Transaction } from '@webspend/shared';
import { loadConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { fixedSource } from '../rates/fixed.ts';
import { storeRates } from '../rates/store.ts';
import { buildApp } from './app.ts';

async function client() {
  const db = await openDb({ dataDir: 'memory://' });
  await storeRates(db, '2026-01-01', { NGN: 1500, GBP: 0.78, EUR: 0.92 });
  const config = loadConfig({ NODE_ENV: 'test', RATE_SOURCE: 'fixed', FIXED_RATES: 'NGN:1500' });
  const app = buildApp({ db, config, rateSource: fixedSource({ NGN: 1500 }) });
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, call };
}

test('sign in, categorise, enter a transaction, read the summary, remember the payee', async () => {
  const { db, call } = await client();

  assert.equal((await call('GET', '/api/me')).status, 401);
  const meta = await call('GET', '/api/meta');
  assert.deepEqual(meta.body, { version: '0.1.0', googleAuth: false, devAuth: true });

  const signIn = await call('POST', '/auth/dev', { email: 'dev@webspend.local' });
  assert.equal(signIn.status, 200);
  assert.ok(signIn.body.token);
  assert.equal(signIn.body.user.defaultCurrency, 'NGN');

  const me = await call('GET', '/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'dev@webspend.local');

  const categories = await call('GET', '/api/categories');
  assert.equal(categories.body.categories.length, 6);
  const created = await call('POST', '/api/categories', { name: 'Gifts' });
  assert.equal(created.status, 201);
  assert.equal((await call('POST', '/api/categories', { name: 'gifts' })).status, 409);
  assert.equal((await call('POST', '/api/categories', { name: '' })).status, 400);
  assert.equal(
    (await call('POST', '/api/categories', { name: '' })).body.error.code,
    'invalid_request',
  );

  const accounts = await call('GET', '/api/accounts');
  const cash = accounts.body.accounts.find((a: { bank: string }) => a.bank === 'cash');
  assert.equal(cash.status, 'off');

  const entry = await call('POST', '/api/transactions', {
    accountId: cash.id,
    occurredAt: '2026-10-03T12:00:00+01:00',
    type: 'expense',
    amountMinor: 150_000,
    currency: 'NGN',
    userDescription: 'Lunch',
    counterpartyName: 'Mama Put',
  });
  assert.equal(entry.status, 201);
  const transaction: Transaction = entry.body.transaction;
  assert.equal(transaction.title, 'Lunch');
  assert.equal(transaction.usdMinor, 100);
  assert.equal(transaction.defaultMinor, 150_000);
  assert.equal(transaction.source, 'manual');
  await call('POST', '/api/transactions', {
    accountId: cash.id,
    occurredAt: '2026-10-04T12:00:00+01:00',
    type: 'expense',
    amountMinor: 50_000,
    currency: 'NGN',
    userDescription: 'Dinner',
    counterpartyName: 'Mama Put',
  });
  await call('POST', '/api/transactions', {
    accountId: cash.id,
    occurredAt: '2026-10-04T13:00:00+01:00',
    type: 'income',
    amountMinor: 1_000_000,
    currency: 'NGN',
    userDescription: 'Sold a bike',
  });

  await call('PATCH', '/api/settings', { monthlyBudgetMinor: 1_000_000 });
  const summary = await call('GET', '/api/summary?month=2026-10');
  const s: Summary = summary.body;
  assert.equal(s.spentMinor, 200_000);
  assert.equal(s.incomeMinor, 1_000_000);
  assert.equal(s.leftMinor, 800_000);
  assert.equal(s.spentUsdMinor, 133);
  assert.equal(s.todayPerUsd, 1500);
  assert.equal(s.uncategorisedCount, 2);
  assert.deepEqual(s.byCategory, [
    { categoryId: null, name: 'Needs a category', minor: 200_000, usdMinor: 133, count: 2 },
  ]);

  const patched = await call('PATCH', `/api/transactions/${transaction.id}`, {
    categoryId: created.body.category.id,
    rememberForPayee: true,
  });
  assert.equal(patched.body.transaction.categoryName, 'Gifts');
  const list = await call('GET', '/api/transactions?month=2026-10&categoryId=none');
  assert.equal(list.body.transactions.length, 1);
  assert.equal(list.body.transactions[0].title, 'Sold a bike');
  assert.equal(list.body.hasMore, false);
  const search = await call('GET', '/api/transactions?q=dinner');
  assert.equal(search.body.transactions.length, 1);
  assert.equal(search.body.transactions[0].categoryName, 'Gifts');
  const [rule] = await db.query('select payee_key from payee_rules');
  assert.equal(rule!.payee_key, 'mama put');

  const usd = await call('PATCH', '/api/settings', { defaultCurrency: 'USD' });
  assert.equal(usd.body.user.defaultCurrency, 'USD');
  const converted = await call('GET', `/api/transactions/${transaction.id}`);
  assert.equal(converted.body.transaction.defaultCurrency, 'USD');
  assert.equal(converted.body.transaction.defaultMinor, 100);
  assert.equal(converted.body.transaction.usdMinor, 100);
  const usdSummary: Summary = (await call('GET', '/api/summary?month=2026-10')).body;
  assert.equal(usdSummary.currency, 'USD');
  assert.equal(usdSummary.spentMinor, 133);
  assert.equal(usdSummary.todayPerUsd, null);

  assert.equal(
    (await call('GET', '/api/transactions/00000000-0000-0000-0000-000000000000')).status,
    404,
  );
  assert.equal((await call('GET', '/api/transactions/nope')).status, 404);
  assert.equal((await call('PATCH', '/api/gaps/nope', { status: 'dismissed' })).status, 404);
  assert.equal((await call('DELETE', `/api/accounts/${cash.id}`)).status, 409);
  const rates = await call('GET', '/api/rates?day=2026-10-03');
  assert.ok(
    rates.body.rates.some(
      (r: { currency: string; perUsd: number }) => r.currency === 'NGN' && r.perUsd === 1500,
    ),
  );

  const trackedOn = await call('PATCH', `/api/accounts/${cash.id}`, { tracked: true });
  assert.equal(trackedOn.body.account.status, 'waiting');
  assert.ok(trackedOn.body.account.trackingFrom);

  assert.equal((await call('POST', '/auth/logout')).status, 204);
  await db.close();
});
