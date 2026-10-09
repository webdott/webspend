/**
 * Helpers for the values the database hands back. Both backends return `timestamptz` and `date`
 * as `Date`, `numeric` as a string and `bigint` as a number.
 */

export function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  throw new TypeError(`expected a timestamp, got ${typeof value}`);
}

export function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}

export function decimal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function integerOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

export function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
