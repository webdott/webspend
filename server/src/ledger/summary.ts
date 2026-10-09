import type { Bank, CategoryTotal, Summary, User } from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { isoOrNull } from '../db/rows.ts';
import { rateFor } from '../rates/store.ts';
import { monthRange, todayLagos } from './time.ts';
import { TRANSACTION_SELECT } from './transactions.ts';

/**
 * The month's totals in the user's default currency. Transfers to self never count; fees and
 * exchange losses count as spending like any other expense.
 */
export async function monthSummary(db: Db, user: User, month: string): Promise<Summary> {
  const range = monthRange(month);
  const params = [user.id, user.defaultCurrency, range.start, range.end];
  const inMonth = `with month as (${TRANSACTION_SELECT}
    where t.user_id = $1 and t.occurred_at >= $3::timestamptz and t.occurred_at < $4::timestamptz)`;

  const [totals] = await db.query<{
    spent: number;
    income: number;
    spent_usd: number | null;
    income_usd: number | null;
    uncategorised: number;
  }>(
    `${inMonth}
     select coalesce(sum(default_minor) filter (where type = 'expense'), 0)::bigint as spent,
            coalesce(sum(default_minor) filter (where type = 'income'), 0)::bigint as income,
            -- A null USD total means at least one expense has no rate yet.
            case when bool_or(type = 'expense' and usd_minor is null) then null
                 else coalesce(sum(usd_minor) filter (where type = 'expense'), 0)::bigint end
              as spent_usd,
            case when bool_or(type = 'income' and usd_minor is null) then null
                 else coalesce(sum(usd_minor) filter (where type = 'income'), 0)::bigint end
              as income_usd,
            count(*) filter (where type = 'expense' and category_id is null)::int as uncategorised
     from month`,
    params,
  );

  const categoryRows = await db.query<{
    category_id: string | null;
    name: string | null;
    minor: number;
    usd_minor: number | null;
    count: number;
  }>(
    `${inMonth}
     select category_id, category_name as name,
            coalesce(sum(default_minor), 0)::bigint as minor,
            case when bool_or(usd_minor is null) then null else sum(usd_minor)::bigint end as usd_minor,
            count(*)::int as count
     from month where type = 'expense'
     group by category_id, category_name
     order by minor desc, count desc, name`,
    params,
  );

  const [before] = await db.query<{ net: number }>(
    `with earlier as (${TRANSACTION_SELECT}
       where t.user_id = $1 and t.occurred_at < $3::timestamptz)
     select (coalesce(sum(default_minor) filter (where type = 'income'), 0)
           - coalesce(sum(default_minor) filter (where type = 'expense'), 0))::bigint as net
     from earlier`,
    [user.id, user.defaultCurrency, range.start],
  );

  const [latest] = await db.query<{ last_alert_at: unknown; banks: string[] | null }>(
    `select max(last_alert_at) as last_alert_at,
            array_remove(array_agg(distinct bank) filter (where tracked), null) as banks
     from accounts where user_id = $1`,
    [user.id],
  );

  const budget = user.monthlyBudgetMinor;
  const spent = Number(totals?.spent ?? 0);
  const income = Number(totals?.income ?? 0);
  const spentUsd = totals?.spent_usd === null ? null : Number(totals?.spent_usd ?? 0);
  const incomeUsd = totals?.income_usd === null ? null : Number(totals?.income_usd ?? 0);
  const todayPerUsd =
    user.defaultCurrency === 'USD' ? null : await rateFor(db, user.defaultCurrency, todayLagos());
  const left = budget === null ? null : budget - spent;
  const leftUsd = left === null || todayPerUsd === null ? null : Math.round(left / todayPerUsd);

  const carryOver = Number(before?.net ?? 0);
  const available = carryOver + income - spent;
  const inUsd = (minor: number) => {
    if (user.defaultCurrency === 'USD') return minor;
    return todayPerUsd === null ? null : Math.round(minor / todayPerUsd);
  };

  const byCategory: CategoryTotal[] = categoryRows.map((row) => ({
    categoryId: row.category_id,
    name: row.category_id ? String(row.name) : 'Needs a category',
    minor: Number(row.minor),
    usdMinor: row.usd_minor === null ? null : Number(row.usd_minor),
    count: Number(row.count),
  }));

  return {
    month,
    currency: user.defaultCurrency,
    budgetMinor: budget,
    spentMinor: spent,
    incomeMinor: income,
    leftMinor: left,
    spentUsdMinor: user.defaultCurrency === 'USD' ? spent : spentUsd,
    incomeUsdMinor: user.defaultCurrency === 'USD' ? income : incomeUsd,
    leftUsdMinor: user.defaultCurrency === 'USD' ? left : leftUsd,
    carryOverMinor: carryOver,
    availableMinor: available,
    carryOverUsdMinor: inUsd(carryOver),
    availableUsdMinor: inUsd(available),
    todayPerUsd,
    byCategory,
    uncategorisedCount: Number(totals?.uncategorised ?? 0),
    lastAlertAt: isoOrNull(latest?.last_alert_at),
    trackedBanks: (latest?.banks ?? []) as Bank[],
  };
}
