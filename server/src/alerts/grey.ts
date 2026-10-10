import {
  capture,
  flatten,
  lagosIso,
  LayoutError,
  reportingLayoutErrors,
  to24Hour,
  toMinor,
} from './text.ts';
import type { AlertEmail, ParsedAlert, ParseResult } from './types.ts';

const SUCCESS_SUBJECT = 'Card transaction successful';
// Grey also writes about declined cards, logins and offers from the same address. Only mail
// that sounds like money moving is worth flagging when its layout is unknown.
const MONEY_SUBJECT = /transaction|received|deposit|payment|withdraw|transfer|funded/i;

const MERCHANT = /Merchant (.+?) Amount debited \$([\d,]+\.\d{2})/;
const DESCRIPTION = /Description (.+?) Reference (\S+) /;
const DATE_TIME = /Date & time (\d{1,2})\/(\d{1,2})\/(\d{4}) - (\d{1,2}):(\d{2}) (AM|PM) UTC/;

/**
 * Parses Grey's "Card transaction successful" email: a dollar card spend with the merchant, a
 * reference and a UTC time. There is no balance in the email, so the balance check is skipped
 * for Grey. Incoming money has no sample yet and is flagged as an unknown layout.
 */
export const parseGreyAlert = reportingLayoutErrors((email: AlertEmail): ParseResult => {
  const subject = email.subject.trim();
  if (subject !== SUCCESS_SUBJECT) {
    if (subject === 'Card transaction failed' || !MONEY_SUBJECT.test(subject)) {
      return { ok: false, reason: 'not_a_transaction', detail: subject };
    }
    throw new LayoutError(`unknown Grey subject "${subject}"`);
  }

  const text = flatten(email.text);
  const [merchant, amount] = capture(text, MERCHANT, 'Merchant and Amount debited');
  const [description, reference] = capture(text, DESCRIPTION, 'Description and Reference');
  const [first, second, year, hour, minute, meridiem] = capture(text, DATE_TIME, 'Date & time');
  const { month, day } = monthAndDay(Number(first), Number(second));

  // The email reports UTC; Lagos is one hour ahead.
  const utc = Date.UTC(
    Number(year),
    month - 1,
    day,
    to24Hour(Number(hour), meridiem!),
    Number(minute),
  );
  const lagos = new Date(utc + 60 * 60 * 1000);

  const alert: ParsedAlert = {
    bank: 'grey',
    direction: 'debit',
    amountMinor: toMinor(amount!),
    currency: 'USD',
    occurredAt: lagosIso({
      year: lagos.getUTCFullYear(),
      month: lagos.getUTCMonth() + 1,
      day: lagos.getUTCDate(),
      hour: lagos.getUTCHours(),
      minute: lagos.getUTCMinutes(),
      second: 0,
    }),
    account: null,
    balanceAfterMinor: null,
    counterparty: { name: merchant!.trim(), bank: null, account: null },
    description: description!.trim(),
    reference: reference!,
    channel: 'card',
  };
  return { ok: true, alert };
});

/**
 * Grey is a US company and writes dates as month/day/year. The only sample so far is 10/10,
 * which reads the same either way, so a day above twelve settles the order if it ever differs.
 */
function monthAndDay(first: number, second: number): { month: number; day: number } {
  if (first > 12 && second <= 12) return { month: second, day: first };
  if (first > 12 || second > 31) throw new LayoutError(`unreadable date ${first}/${second}`);
  return { month: first, day: second };
}
