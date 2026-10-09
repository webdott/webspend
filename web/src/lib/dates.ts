/** Date helpers. Everything is in the browser's local time zone. */

const pad = (n: number) => String(n).padStart(2, '0');

export function monthOf(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function dayOf(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentMonth(now = new Date()): string {
  return monthOf(now);
}

export function isValidMonth(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  const [y = 2026, m = 1] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthOf(d);
}

export function formatMonthTitle(month: string): string {
  const [y = 2026, m = 1] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function formatDayHeading(day: string, today = new Date()): string {
  const t = dayOf(today);
  if (day === t) return 'Today';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (day === dayOf(y)) return 'Yesterday';
  const [yy = 2026, mm = 1, dd = 1] = day.split('-').map(Number);
  const d = new Date(yy, mm - 1, dd);
  const sameYear = yy === today.getFullYear();
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatAgo(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function nowForInput(now = new Date()): string {
  return `${dayOf(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function inputToIso(value: string): string {
  const d = new Date(value);
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${dayOf(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export type DayGroup<T> = { day: string; heading: string; items: T[] };

export function groupByDay<T extends { occurredAt: string }>(
  items: readonly T[],
  today = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const day = dayOf(item.occurredAt);
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, heading: formatDayHeading(day, today), items: [item] });
  }
  return groups;
}
