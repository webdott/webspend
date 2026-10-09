import { capture, flatten, lagosIso, reportingLayoutErrors, to24Hour, toMinor } from './text.ts';
import type { AlertEmail, ParsedAlert, ParseResult } from './types.ts';

const AMOUNT = String.raw`NGN ([\d,]+(?:\.\d{1,2})?)`;
const DIRECTION = /a (DEBIT|CREDIT) transaction occurred/;
const ACCOUNT = /Account Number : (\S+)/;
const DESCRIPTION_AND_AMOUNT = new RegExp(`Description : (.+?) Amount : ${AMOUNT} Value Date`);
const VALUE_DATE = /Value Date : (\d{4})-(\d{2})-(\d{2})/;
const TIME = /Time of Transaction : (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)/;
const DOCUMENT_NUMBER = /Document Number : (\S+)/;
const CURRENT_BALANCE = new RegExp(`Current Balance : ${AMOUNT}`);

/**
 * Parses GTBank's "Transaction Notification" (GeNS) email, for both debits and credits.
 *
 * The other party is only named inside the free-text description, in several formats, so
 * `counterparty` is left null and the description is kept whole.
 */
export const parseGtbankAlert = reportingLayoutErrors((email: AlertEmail): ParseResult => {
  // The alert is a table; its cell borders arrive as pipes between each label and value.
  const text = flatten(email.text.replaceAll('|', ' '));
  const [direction] = capture(text, DIRECTION, 'the debit or credit line');
  const [account] = capture(text, ACCOUNT, 'Account Number');
  const [description, amount] = capture(text, DESCRIPTION_AND_AMOUNT, 'Description and Amount');
  const [year, month, day] = capture(text, VALUE_DATE, 'Value Date');
  const [hour, minute, second, meridiem] = capture(text, TIME, 'Time of Transaction');
  const [reference] = capture(text, DOCUMENT_NUMBER, 'Document Number');
  const [balance] = capture(text, CURRENT_BALANCE, 'Current Balance');

  const alert: ParsedAlert = {
    bank: 'gtbank',
    direction: direction === 'DEBIT' ? 'debit' : 'credit',
    amountMinor: toMinor(amount!),
    currency: 'NGN',
    occurredAt: lagosIso({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: to24Hour(Number(hour), meridiem!),
      minute: Number(minute),
      second: Number(second),
    }),
    account: account!,
    balanceAfterMinor: toMinor(balance!),
    counterparty: null,
    description: description!,
    reference: reference!,
    channel: channelOf(description!),
  };
  return { ok: true, alert };
});

function channelOf(description: string): ParsedAlert['channel'] {
  if (description.startsWith('WEB PUR')) return 'card';
  if (description.includes('TRANSFER')) return 'transfer';
  return 'unknown';
}
