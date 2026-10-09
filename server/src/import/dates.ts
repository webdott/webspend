/**
 * Reads the date formats bank statements use. Numeric dates follow the chosen `dateOrder`; a
 * missing offset means Lagos time, which is the only zone the banks report in.
 */
import type { DateOrder } from '@webspend/shared';
import { LAGOS_OFFSET } from '../ledger/time.ts';

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const TIME = String.raw`(?:[T\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?`;
const OFFSET = String.raw`\s*(Z|[+-]\d{2}:?\d{2})?`;
const NUMERIC = new RegExp(
  String.raw`^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})${TIME}${OFFSET}$`,
  'i',
);
const DAY_MONTH_NAME = new RegExp(
  String.raw`^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]{3,9})\.?,?[\s-]+(\d{4})${TIME}${OFFSET}$`,
  'i',
);
const MONTH_NAME_DAY = new RegExp(
  String.raw`^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})${TIME}${OFFSET}$`,
  'i',
);

export function parseDate(input: string, dateOrder: DateOrder): string | null {
  const text = input.trim();
  if (!text) return null;

  let parts: { year: number; month: number; day: number } | null = null;
  let rest: (string | undefined)[] = [];

  let match = NUMERIC.exec(text);
  if (match) {
    const [a, b, c] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[1]!.length === 4) parts = { year: a, month: b, day: c };
    else if (match[3]!.length === 4 || match[3]!.length === 2) {
      const year = match[3]!.length === 2 ? 2000 + c : c;
      parts = dateOrder === 'mdy' ? { year, month: a, day: b } : { year, month: b, day: a };
    }
    rest = match.slice(4);
  } else if ((match = DAY_MONTH_NAME.exec(text))) {
    const month = MONTHS[match[2]!.slice(0, 3).toLowerCase()];
    if (month) parts = { year: Number(match[3]), month, day: Number(match[1]) };
    rest = match.slice(4);
  } else if ((match = MONTH_NAME_DAY.exec(text))) {
    const month = MONTHS[match[1]!.slice(0, 3).toLowerCase()];
    if (month) parts = { year: Number(match[3]), month, day: Number(match[2]) };
    rest = match.slice(4);
  }
  if (!parts || !validDate(parts)) return null;

  const [hourText, minuteText, secondText, meridiem, offset] = rest;
  let hour = Number(hourText ?? 0);
  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  const minute = Number(minuteText ?? 0);
  const second = Number(secondText ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const pad = (value: number) => String(value).padStart(2, '0');
  const zone = offset ? normaliseOffset(offset) : LAGOS_OFFSET;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${zone}`;
}

export function isAmbiguousDate(input: string): boolean {
  const match = NUMERIC.exec(input.trim());
  if (!match || match[1]!.length === 4) return false;
  const first = Number(match[1]);
  const second = Number(match[2]);
  return first <= 12 && second <= 12 && first !== second;
}

export function impliedOrder(input: string): DateOrder | null {
  const match = NUMERIC.exec(input.trim());
  if (!match) return null;
  if (match[1]!.length === 4) return 'ymd';
  if (Number(match[1]) > 12) return 'dmy';
  if (Number(match[2]) > 12) return 'mdy';
  return null;
}

function validDate({ year, month, day }: { year: number; month: number; day: number }): boolean {
  if (year < 1970 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function normaliseOffset(offset: string): string {
  if (offset.toUpperCase() === 'Z') return 'Z';
  return offset.includes(':') ? offset : `${offset.slice(0, 3)}:${offset.slice(3)}`;
}
