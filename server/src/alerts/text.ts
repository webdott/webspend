import type { AlertParser, ParseResult } from './types.ts';

export class LayoutError extends Error {}

/**
 * Alerts spread labels and values across lines and padding. Collapsing whitespace first lets
 * every parser match with single-line patterns.
 */
export function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function capture(text: string, pattern: RegExp, field: string): string[] {
  const match = pattern.exec(text);
  if (!match) throw new LayoutError(`could not find ${field}`);
  return match.slice(1);
}

/** Converts `"50,000.00"` or `"6685"` to kobo using string arithmetic, never floats. */
export function toMinor(amount: string): number {
  const [whole = '0', fraction = ''] = amount.replace(/,/g, '').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

export function to24Hour(hour: number, meridiem: string): number {
  if (meridiem === 'AM') return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthNumber(shortName: string): number {
  const index = MONTHS.indexOf(shortName);
  if (index === -1) throw new LayoutError(`unknown month "${shortName}"`);
  return index + 1;
}

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Nigeria has one time zone and no daylight saving, so the offset is fixed. */
export function lagosIso({ year, month, day, hour, minute, second }: LocalDateTime): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+01:00`;
}

export function reportingLayoutErrors(parse: AlertParser): AlertParser {
  return (email): ParseResult => {
    try {
      return parse(email);
    } catch (error) {
      if (!(error instanceof LayoutError)) throw error;
      return {
        ok: false,
        reason: 'unrecognised_layout',
        detail: `"${email.subject}" from ${email.from}: ${error.message}`,
      };
    }
  };
}
