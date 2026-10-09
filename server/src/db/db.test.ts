import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from './index.ts';

test('migrations apply and bigint comes back as a number', async () => {
  const db = await openDb({ dataDir: 'memory://' });
  const [user] = await db.query<{ id: string }>(
    "insert into users (email) values ('t@example.com') returning id",
  );
  const [account] = await db.query<{ id: string }>(
    "insert into accounts (user_id, bank, name, last_balance_minor) values ($1, 'opay', 'OPay', 9007199254740) returning id",
    [user!.id],
  );
  const [row] = await db.query<{ last_balance_minor: number }>(
    'select last_balance_minor from accounts where id = $1',
    [account!.id],
  );
  assert.equal(row!.last_balance_minor, 9007199254740);
  assert.equal(typeof row!.last_balance_minor, 'number');
  await db.close();
});

test('a transaction rolls back on error', async () => {
  const db = await openDb({ dataDir: 'memory://' });
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.query("insert into users (email) values ('a@example.com')");
      throw new Error('boom');
    }),
  );
  const rows = await db.query('select * from users');
  assert.equal(rows.length, 0);
  await db.close();
});
