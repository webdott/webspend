import {
  capture,
  flatten,
  lagosIso,
  monthNumber,
  reportingLayoutErrors,
  to24Hour,
  toMinor,
} from './text.ts';
import type { AlertEmail, Counterparty, ParsedAlert, ParseResult } from './types.ts';

// Airtime and electricity purchases also produce a normal debit alert, so their separate
// receipts are skipped.
const NON_TRANSACTION_SUBJECTS = [
  'Moniepoint Successful Login',
  'Airtime Purchase Successful',
  'Electricity Payment Successful',
];

const AMOUNT = /a (debit|credit) transaction occurred.*? (?:Debit|Credit) Amount ([\d,]+\.\d{2})/;
const SENDER = /Sender's Name: (?:from )?(.+?) Date & Time:/;
const BALANCE = /Account Balance: N ([\d,]+\.\d{2})/;
const ACCOUNT = /Account Number: (\d+)/;
const DATE_TIME = /Date & Time: (\d{2}) (\w{3}), (\d{4}) \| (\d{2}):(\d{2}):(\d{2}) (AM|PM)/;
const NARRATION = /Narration: (.+?) If you experience/;
const TRANSFER_NARRATION = /^TRANSFER TO (.+) (\*+\d+)\/(.+)$/;

// The narration runs the recipient's name straight into their bank's name. Banks are listed here
// as they are seen in real alerts; an unlisted bank leaves the whole text in `name`.
const BANK_NAMES_IN_NARRATIONS = ['Guaranty Trust Bank'];

/**
 * Parses Moniepoint's "Debit alert!" and "Credit alert!" emails, which share one layout. A debit
 * narration names the recipient and their bank; a credit names only the sending bank.
 */
export const parseMoniepointAlert = reportingLayoutErrors((email: AlertEmail): ParseResult => {
  if (NON_TRANSACTION_SUBJECTS.includes(email.subject.trim())) {
    return { ok: false, reason: 'not_a_transaction', detail: email.subject };
  }

  const text = flatten(email.text);
  const [kind, amount] = capture(text, AMOUNT, 'Debit or Credit Amount');
  const direction = kind === 'credit' ? 'credit' : 'debit';
  const [balance] = capture(text, BALANCE, 'Account Balance');
  const [account] = capture(text, ACCOUNT, 'Account Number');
  const [day, month, year, hour, minute, second, meridiem] = capture(
    text,
    DATE_TIME,
    'Date & Time',
  );
  const [narration] = capture(text, NARRATION, 'Narration');
  const transfer = direction === 'debit' ? TRANSFER_NARRATION.exec(narration!) : null;
  const sender = direction === 'credit' ? SENDER.exec(text)?.[1]?.trim() : undefined;

  const alert: ParsedAlert = {
    bank: 'moniepoint',
    direction,
    amountMinor: toMinor(amount!),
    currency: 'NGN',
    occurredAt: lagosIso({
      year: Number(year),
      month: monthNumber(month!),
      day: Number(day),
      hour: to24Hour(Number(hour), meridiem!),
      minute: Number(minute),
      second: Number(second),
    }),
    account: account!,
    balanceAfterMinor: toMinor(balance!),
    counterparty: transfer
      ? recipient(transfer[1]!, transfer[2]!)
      : sender
        ? { name: sender, bank: null, account: null }
        : null,
    description: narration!,
    reference: transfer ? transfer[3]! : null,
    channel: transfer || /^TRF\b|^TRANSFER\b/.test(narration!) ? 'transfer' : 'unknown',
  };
  return { ok: true, alert };
});

function recipient(nameAndBank: string, maskedAccount: string): Counterparty {
  const bank = BANK_NAMES_IN_NARRATIONS.find((known) => nameAndBank.endsWith(` ${known}`));
  if (!bank) return { name: nameAndBank, bank: null, account: maskedAccount };
  return { name: nameAndBank.slice(0, -bank.length).trim(), bank, account: maskedAccount };
}
