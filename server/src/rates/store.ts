/**
 * The `fx_rates` table: one row per day and currency with units per US dollar.
 * Transactions keep the rate from their own day, so lookups fall back to the nearest earlier day
 * when a day has no row (weekends, downtime).
 */
import type { Currency, FxRate } from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { decimal } from '../db/rows.ts';
import { todayLagos } from '../ledger/time.ts';
import type { RateSource } from './source.ts';

const STORED_CURRENCIES: Currency[] = ['NGN', 'GBP', 'EUR'];

export async function rateFor(db: Db, currency: Currency, day: string): Promise<number | null> {
  if (currency === 'USD') return 1;
  const [row] = await db.query<{ per_usd: string }>(
    `select per_usd from fx_rates
      where currency = $1 and day <= $2::date
      order by day desc limit 1`,
    [currency, day],
  );
  return row ? decimal(row.per_usd) : null;
}

type DatedRate = { day: string; perUsd: number };

/** Every stored rate for `currency` up to `day`, oldest first, to look up many days at once. */
export async function ratesUpTo(db: Db, currency: Currency, day: string): Promise<DatedRate[]> {
  const rows = await db.query<{ day: string; per_usd: string }>(
    `select day::text as day, per_usd from fx_rates
      where currency = $1 and day <= $2::date
      order by day`,
    [currency, day],
  );
  return rows.map((row) => ({ day: row.day, perUsd: decimal(row.per_usd) ?? 0 }));
}

/** The same nearest-earlier-day rule as `rateFor`, over rates from `ratesUpTo`. */
export function rateOnOrBefore(rates: DatedRate[], day: string): number | null {
  for (let index = rates.length - 1; index >= 0; index -= 1) {
    if (rates[index]!.day <= day) return rates[index]!.perUsd;
  }
  return null;
}

export async function ratesOn(db: Db, day: string): Promise<FxRate[]> {
  const rows = await db.query<{ day: string; currency: string; per_usd: string; source: string }>(
    `select distinct on (currency) day::text as day, currency, per_usd, source
       from fx_rates
      where day <= $1::date
      order by currency, day desc`,
    [day],
  );
  const rates: FxRate[] = [{ day, currency: 'USD', perUsd: 1, source: 'identity' }];
  for (const row of rows) {
    rates.push({
      day: row.day,
      currency: row.currency as Currency,
      perUsd: decimal(row.per_usd) ?? 0,
      source: row.source,
    });
  }
  return rates;
}

export async function refreshToday(db: Db, source: RateSource): Promise<FxRate[]> {
  const table = await source.fetchLatest();
  const day = todayLagos();
  for (const currency of STORED_CURRENCIES) {
    const perUsd = table[currency];
    if (perUsd === undefined) continue;
    await db.query(
      `insert into fx_rates (day, currency, per_usd, source, fetched_at)
       values ($1::date, $2, $3, $4, now())
       on conflict (day, currency) do update
         set per_usd = excluded.per_usd, source = excluded.source, fetched_at = now()`,
      [day, currency, perUsd, source.name],
    );
  }
  return ratesOn(db, day);
}

export async function storeRates(
  db: Db,
  day: string,
  table: Partial<Record<Currency, number>>,
  source = 'fixed',
): Promise<void> {
  for (const currency of STORED_CURRENCIES) {
    const perUsd = table[currency];
    if (perUsd === undefined) continue;
    await db.query(
      `insert into fx_rates (day, currency, per_usd, source)
       values ($1::date, $2, $3, $4)
       on conflict (day, currency) do update set per_usd = excluded.per_usd, source = excluded.source`,
      [day, currency, perUsd, source],
    );
  }
}
