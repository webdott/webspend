import type { Bank, Currency, Gap } from '@webspend/shared';
import type { Db, Row } from '../db/index.ts';
import { iso } from '../db/rows.ts';
import { NotFoundError } from './errors.ts';

const SELECT = `select g.id, g.account_id, a.name as account_name, a.bank, g.from_at, g.to_at,
    g.expected_balance_minor, g.actual_balance_minor, g.difference_minor, g.currency, g.status,
    g.created_at
  from gaps g join accounts a on a.id = g.account_id`;

export function toGap(row: Row): Gap {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    bank: row.bank as Bank,
    fromAt: iso(row.from_at),
    toAt: iso(row.to_at),
    expectedBalanceMinor: Number(row.expected_balance_minor),
    actualBalanceMinor: Number(row.actual_balance_minor),
    differenceMinor: Number(row.difference_minor),
    currency: row.currency as Currency,
    status: row.status as Gap['status'],
    createdAt: iso(row.created_at),
  };
}

export async function listGaps(
  db: Db,
  userId: string,
  status: Gap['status'] | null,
): Promise<Gap[]> {
  const rows = await db.query(
    `${SELECT} where g.user_id = $1 and ($2::text is null or g.status = $2)
     order by g.to_at desc, g.created_at desc`,
    [userId, status],
  );
  return rows.map(toGap);
}

export async function getGap(db: Db, userId: string, id: string): Promise<Gap> {
  const [row] = await db.query(`${SELECT} where g.user_id = $1 and g.id = $2::uuid`, [userId, id]);
  if (!row) throw new NotFoundError('gap not found');
  return toGap(row);
}

export async function insertGap(
  db: Db,
  input: {
    userId: string;
    accountId: string;
    fromAt: string;
    toAt: string;
    expectedBalanceMinor: number;
    actualBalanceMinor: number;
    currency: Currency;
  },
): Promise<Gap> {
  const [inserted] = await db.query<{ id: string }>(
    `insert into gaps (user_id, account_id, from_at, to_at, expected_balance_minor,
       actual_balance_minor, difference_minor, currency)
     values ($1, $2::uuid, $3::timestamptz, $4::timestamptz, $5, $6, $7, $8) returning id`,
    [
      input.userId,
      input.accountId,
      input.fromAt,
      input.toAt,
      input.expectedBalanceMinor,
      input.actualBalanceMinor,
      input.actualBalanceMinor - input.expectedBalanceMinor,
      input.currency,
    ],
  );
  return getGap(db, input.userId, inserted!.id);
}

export async function setGapStatus(
  db: Db,
  userId: string,
  id: string,
  status: 'open' | 'dismissed',
): Promise<Gap> {
  await getGap(db, userId, id);
  await db.query('update gaps set status = $3 where user_id = $1 and id = $2::uuid', [
    userId,
    id,
    status,
  ]);
  return getGap(db, userId, id);
}

export async function markGapFilled(
  db: Db,
  userId: string,
  id: string,
  importId: string,
): Promise<Gap> {
  await db.query(
    `update gaps set status = 'filled', filled_by_import_id = $3::uuid
     where user_id = $1 and id = $2::uuid`,
    [userId, id, importId],
  );
  return getGap(db, userId, id);
}

export async function countOpenGaps(db: Db, userId: string): Promise<number> {
  const [row] = await db.query<{ n: number }>(
    "select count(*)::int as n from gaps where user_id = $1 and status = 'open'",
    [userId],
  );
  return Number(row?.n ?? 0);
}
