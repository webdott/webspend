/**
 * The transactions repository. Every read goes through one SELECT that also computes the
 * conversions, so the list, the detail and the summary agree to the kobo:
 * - `usd_minor`: the amount through the rate stamped on the row (`fx_per_usd`).
 * - `default_minor`: the amount in the user's default currency, converted through US dollars with
 *   the default currency's rate for the transaction's own day (nearest earlier day when missing).
 */
import type {
  Bank,
  Currency,
  Transaction,
  TransactionSource,
  TransactionType,
} from '@webspend/shared';
import type { Db, Row } from '../db/index.ts';
import { decimal, integerOrNull, iso, text } from '../db/rows.ts';
import { NotFoundError } from './errors.ts';
import { monthRange } from './time.ts';

/**
 * `$1` is the user id and `$2` the user's default currency wherever this fragment is used.
 * Postgres `round()` rounds half away from zero, the same as `convertMinor` in shared.
 */
const USD_MINOR = `(case when t.currency = 'USD' then t.amount_minor
         when t.fx_per_usd is null then null
         else round(t.amount_minor / t.fx_per_usd)::bigint end)`;

export const TRANSACTION_SELECT = `
  select t.id, t.occurred_at, t.type, t.direction, t.amount_minor, t.currency, t.fx_per_usd,
    t.account_id, a.name as account_name, a.bank, t.counterparty_name, t.counterparty_bank,
    t.counterparty_account, t.bank_description, t.user_description, t.user_title, t.category_id,
    c.name as category_name, t.source, t.bank_reference, t.transfer_group_id, t.is_fee,
    t.created_at, t.payee_key, t.balance_after_minor, t.unsure_transfer,
    $2::text as default_currency,
    ${USD_MINOR} as usd_minor,
    case when t.currency = $2::text then t.amount_minor
         when $2::text = 'USD' then ${USD_MINOR}
         when t.currency = 'USD' and d.per_usd is not null
           then round(t.amount_minor * d.per_usd)::bigint
         when t.fx_per_usd is not null and d.per_usd is not null
           then round(t.amount_minor / t.fx_per_usd * d.per_usd)::bigint
         else null end as default_minor
  from transactions t
  join accounts a on a.id = t.account_id
  left join categories c on c.id = t.category_id
  left join lateral (
    select r.per_usd from fx_rates r
     where r.currency = $2::text and r.day <= (t.occurred_at + interval '1 hour')::date
     order by r.day desc limit 1
  ) d on true`;

export function toTransaction(row: Row): Transaction {
  const userDescription = text(row.user_description);
  const userTitle = text(row.user_title);
  const counterpartyName = text(row.counterparty_name);
  const bankDescription = text(row.bank_description);
  return {
    id: String(row.id),
    occurredAt: iso(row.occurred_at),
    type: row.type as TransactionType,
    amountMinor: Number(row.amount_minor),
    currency: row.currency as Currency,
    defaultMinor: integerOrNull(row.default_minor),
    defaultCurrency: row.default_currency as Currency,
    usdMinor: integerOrNull(row.usd_minor),
    fxPerUsd: decimal(row.fx_per_usd),
    accountId: String(row.account_id),
    accountName: String(row.account_name),
    bank: row.bank as Bank,
    title: userTitle || userDescription || counterpartyName || bankDescription || 'Transaction',
    userTitle,
    counterpartyName,
    counterpartyBank: text(row.counterparty_bank),
    counterpartyAccount: text(row.counterparty_account),
    bankDescription,
    userDescription,
    categoryId: text(row.category_id),
    categoryName: text(row.category_name),
    source: row.source as TransactionSource,
    bankReference: text(row.bank_reference),
    transferGroupId: text(row.transfer_group_id),
    isFee: Boolean(row.is_fee),
    unsureTransfer: Boolean(row.unsure_transfer),
    createdAt: iso(row.created_at),
  };
}

export type Viewer = { id: string; defaultCurrency: Currency };

export type TransactionFilters = {
  month?: string;
  q?: string;
  categoryId?: string;
  accountId?: string;
  type?: TransactionType;
  unsure?: boolean;
  limit?: number;
  before?: string;
};

export async function listTransactions(
  db: Db,
  viewer: Viewer,
  filters: TransactionFilters,
): Promise<{ transactions: Transaction[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const range = filters.month ? monthRange(filters.month) : null;
  const rows = await db.query(
    `${TRANSACTION_SELECT}
     where t.user_id = $1
       and ($3::timestamptz is null or t.occurred_at >= $3::timestamptz)
       and ($4::timestamptz is null or t.occurred_at < $4::timestamptz)
       and ($5::text is null or t.user_title ilike $5 or t.user_description ilike $5
            or t.counterparty_name ilike $5 or t.bank_description ilike $5)
       and ($6::text is null
            or ($6 = 'none' and t.category_id is null)
            or ($6 <> 'none' and t.category_id::text = $6))
       and ($7::text is null or t.account_id::text = $7)
       and ($8::text is null or t.type = $8)
       and ($9::timestamptz is null or t.occurred_at < $9::timestamptz)
       and (not $11::boolean or t.unsure_transfer)
     order by t.occurred_at desc, t.created_at desc, t.id desc
     limit $10`,
    [
      viewer.id,
      viewer.defaultCurrency,
      range?.start ?? null,
      range?.end ?? null,
      filters.q ? `%${escapeLike(filters.q.trim())}%` : null,
      filters.categoryId ?? null,
      filters.accountId ?? null,
      filters.type ?? null,
      filters.before ?? null,
      limit + 1,
      filters.unsure ?? false,
    ],
  );
  const page = rows.slice(0, limit);
  return { transactions: page.map(toTransaction), hasMore: rows.length > limit };
}

export async function getTransaction(db: Db, viewer: Viewer, id: string): Promise<Transaction> {
  const [row] = await db.query(`${TRANSACTION_SELECT} where t.user_id = $1 and t.id = $3::uuid`, [
    viewer.id,
    viewer.defaultCurrency,
    id,
  ]);
  if (!row) throw new NotFoundError('transaction not found');
  return toTransaction(row);
}

export async function getTransactionRow(db: Db, userId: string, id: string): Promise<Row> {
  const [row] = await db.query('select * from transactions where user_id = $1 and id = $2::uuid', [
    userId,
    id,
  ]);
  if (!row) throw new NotFoundError('transaction not found');
  return row;
}

export type TransactionEdits = {
  categoryId?: string | null;
  userDescription?: string | null;
  title?: string | null;
  counterpartyName?: string | null;
  amountMinor?: number;
  occurredAt?: string;
};

export async function setTransactionFields(
  db: Db,
  userId: string,
  id: string,
  patch: TransactionEdits,
): Promise<void> {
  // A new date takes that day's exchange rate, keeping the old one if no rate is known for it.
  await db.query(
    `update transactions t set
       category_id = case when $3 then $4::uuid else category_id end,
       user_description = case when $5 then $6 else user_description end,
       user_title = case when $7 then $8 else user_title end,
       counterparty_name = case when $9 then $10 else counterparty_name end,
       amount_minor = coalesce($11::bigint, amount_minor),
       occurred_at = coalesce($12::timestamptz, occurred_at),
       fx_per_usd = case
         when $12::timestamptz is null or t.currency = 'USD' then fx_per_usd
         else coalesce(
           (select r.per_usd from fx_rates r
             where r.currency = t.currency and r.day <= ($12::timestamptz + interval '1 hour')::date
             order by r.day desc limit 1),
           fx_per_usd)
       end
     where user_id = $1 and id = $2::uuid`,
    [
      userId,
      id,
      'categoryId' in patch,
      patch.categoryId ?? null,
      'userDescription' in patch,
      patch.userDescription || null,
      'title' in patch,
      patch.title || null,
      'counterpartyName' in patch,
      patch.counterpartyName || null,
      patch.amountMinor ?? null,
      patch.occurredAt ?? null,
    ],
  );
}

export async function deleteTransaction(db: Db, userId: string, id: string): Promise<void> {
  await db.query('delete from transactions where user_id = $1 and id = $2::uuid', [userId, id]);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
