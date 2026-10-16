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

const CARD_SUBJECT = 'Card transaction successful';
const FUNDING_SUBJECT = 'Wallet Funding Successful';
// Grey also writes about declined cards, logins and offers from the same address. Only mail
// that sounds like money moving is worth flagging when its layout is unknown.
const MONEY_SUBJECT = /transaction|received|deposit|payment|withdraw|transfer|funded|funding/i;

const MERCHANT = /Merchant (.+?) Amount debited \$([\d,]+\.\d{2})/;
const DESCRIPTION = /Description (.+?) Reference (\S+) /;
const FUNDING =
  /Transaction Type: (.+?) Amount tendered: \$([\d,]+\.\d{2}) Amount received: \$([\d,]+\.\d{2}) Memo: ?(.*?) ?Reference: (\S+) /;
const DATE_TIME = /Date & [Tt]ime:? (\d{1,2})\/(\d{1,2})\/(\d{4}) - (\d{1,2}):(\d{2}) (AM|PM) UTC/;

/**
 * Parses Grey's two money emails. "Card transaction successful" is a dollar card spend with the
 * merchant, a reference and a UTC time. "Wallet Funding Successful" is money arriving in the
 * dollar wallet: the credit is the amount received, since the tendered amount less Grey's fee is
 * what actually landed. Neither email carries a balance, so the balance check is skipped for Grey.
 */
export const parseGreyAlert = reportingLayoutErrors((email: AlertEmail): ParseResult => {
  const subject = email.subject.trim();
  if (subject === CARD_SUBJECT) return { ok: true, alert: cardSpend(flatten(email.text)) };
  if (subject === FUNDING_SUBJECT) return { ok: true, alert: walletFunding(flatten(email.text)) };
  if (subject === 'Card transaction failed' || !MONEY_SUBJECT.test(subject)) {
    return { ok: false, reason: 'not_a_transaction', detail: subject };
  }
  throw new LayoutError(`unknown Grey subject "${subject}"`);
});

function cardSpend(text: string): ParsedAlert {
  const [merchant, amount] = capture(text, MERCHANT, 'Merchant and Amount debited');
  const [description, reference] = capture(text, DESCRIPTION, 'Description and Reference');
  return {
    bank: 'grey',
    direction: 'debit',
    amountMinor: toMinor(amount!),
    currency: 'USD',
    occurredAt: occurredAt(text),
    account: null,
    balanceAfterMinor: null,
    counterparty: { name: merchant!.trim(), bank: null, account: null },
    description: description!.trim(),
    reference: reference!,
    channel: 'card',
  };
}

function walletFunding(text: string): ParsedAlert {
  const [type, tendered, received, memo, reference] = capture(text, FUNDING, 'funding details');
  const note = memo!.trim();
  return {
    bank: 'grey',
    direction: 'credit',
    amountMinor: toMinor(received!),
    currency: 'USD',
    occurredAt: occurredAt(text),
    account: null,
    balanceAfterMinor: null,
    // The email never says who sent the money, only the rails it came over.
    counterparty: null,
    description: `Wallet funding ${type!.trim()}, $${tendered} tendered${note ? `: ${note}` : ''}`,
    reference: reference!,
    channel: 'transfer',
  };
}

/** The email reports UTC; Lagos is one hour ahead. */
function occurredAt(text: string): string {
  const [first, second, year, hour, minute, meridiem] = capture(text, DATE_TIME, 'Date & time');
  const { month, day } = monthAndDay(Number(first), Number(second));
  const utc = Date.UTC(
    Number(year),
    month - 1,
    day,
    to24Hour(Number(hour), meridiem!),
    Number(minute),
  );
  const lagos = new Date(utc + 60 * 60 * 1000);
  return lagosIso({
    year: lagos.getUTCFullYear(),
    month: lagos.getUTCMonth() + 1,
    day: lagos.getUTCDate(),
    hour: lagos.getUTCHours(),
    minute: lagos.getUTCMinutes(),
    second: 0,
  });
}

/**
 * Grey is a US company and writes dates as month/day/year, as 10/16 in the funding sample shows.
 * A day above twelve settles the order if it ever differs.
 */
function monthAndDay(first: number, second: number): { month: number; day: number } {
  if (first > 12 && second <= 12) return { month: second, day: first };
  if (first > 12 || second > 31) throw new LayoutError(`unreadable date ${first}/${second}`);
  return { month: first, day: second };
}
