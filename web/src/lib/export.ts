import type { ExportQuery } from '@webspend/shared';
import { dayOf } from './dates.ts';

export type DayRange = { from: string; to: string };

/** The whole of `month`, with `to` held back to today when the month is still running. */
export function monthBounds(month: string, today = new Date()): DayRange {
  const [y = 2026, m = 1] = month.split('-').map(Number);
  const from = dayOf(new Date(y, m - 1, 1));
  const last = dayOf(new Date(y, m, 0));
  const now = dayOf(today);
  return { from, to: last < now ? last : now };
}

export function yearBounds(today = new Date()): DayRange {
  return { from: dayOf(new Date(today.getFullYear(), 0, 1)), to: dayOf(today) };
}

/** `/api/exports?format=csv&from=…&to=…`, leaving out the filters that are not set. */
export function exportPath(query: ExportQuery): string {
  const params = new URLSearchParams({ format: query.format });
  for (const key of ['from', 'to', 'accountId', 'categoryId', 'type'] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  return `/api/exports?${params.toString()}`;
}

/** The name the server gives the download, so a mock download matches. */
export function exportFilename(query: ExportQuery, range: DayRange): string {
  return `webspend-${range.from}-to-${range.to}.${query.format}`;
}

/** A reason the range cannot be exported, or null when it can. */
export function rangeProblem(range: DayRange, today = new Date()): string | null {
  if (!range.from || !range.to) return 'Pick both a start and an end day.';
  if (range.from > range.to) return 'The start day is after the end day.';
  if (range.to > dayOf(today)) return 'The end day is in the future.';
  return null;
}
