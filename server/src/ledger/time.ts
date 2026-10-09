/**
 * Date helpers. Every amount WebSpend sees is timed in Lagos (+01:00, no daylight saving), so
 * "the transaction's day" and "this month" are read in that zone, both here and in SQL
 * (`occurred_at + interval '1 hour'`).
 */

export const LAGOS_OFFSET = '+01:00';
const HOUR_MS = 60 * 60 * 1000;

export function lagosDay(isoOrDate: string | Date): string {
  const time = typeof isoOrDate === 'string' ? Date.parse(isoOrDate) : isoOrDate.getTime();
  return new Date(time + HOUR_MS).toISOString().slice(0, 10);
}

export function todayLagos(now: Date = new Date()): string {
  return lagosDay(now);
}

/** `2026-10` → the half-open Lagos-time window `[start, end)` as ISO strings. */
export function monthRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    start: `${year}-${pad(monthNumber)}-01T00:00:00${LAGOS_OFFSET}`,
    end: `${nextYear}-${pad(nextMonth)}-01T00:00:00${LAGOS_OFFSET}`,
  };
}

/** The Lagos wall-clock time of an instant, `HH:MM`. */
export function lagosClock(iso: string): string {
  return new Date(Date.parse(iso) + HOUR_MS).toISOString().slice(11, 16);
}

export function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Inclusive Lagos days `from`..`to` as the half-open window `[start, end)`. Either end may be open. */
export function dayRange(from?: string, to?: string): { start: string | null; end: string | null } {
  return {
    start: from ? `${from}T00:00:00${LAGOS_OFFSET}` : null,
    end: to ? `${nextDay(to)}T00:00:00${LAGOS_OFFSET}` : null,
  };
}

export function currentMonth(now: Date = new Date()): string {
  return lagosDay(now).slice(0, 7);
}

export function minutesBetween(a: string | Date, b: string | Date): number {
  const first = typeof a === 'string' ? Date.parse(a) : a.getTime();
  const second = typeof b === 'string' ? Date.parse(b) : b.getTime();
  return Math.abs(first - second) / 60_000;
}
