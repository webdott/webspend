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

// An airtime purchase also produces a normal debit alert, so its separate receipt is skipped.
const NON_TRANSACTION_SUBJECTS = ['Moniepoint Successful Login', 'Airtime Purchase Successful'];

const DEBIT_AMOUNT = /a debit transaction occurred.*? Debit Amount ([\d,]+\.\d{2})/;
const BALANCE = /Account Balance: N ([\d,]+\.\d{2})/;
const ACCOUNT = /Account Number: (\d+)/;
const DATE_TIME = /Date & Time: (\d{2}) (\w{3}), (\d{4}) \| (\d{2}):(\d{2}):(\d{2}) (AM|PM)/;
const NARRATION = /Narration: (.+?) If you experience/;
const TRANSFER_NARRATION = /^TRANSFER TO (.+) (\*+\d+)\/(.+)$/;

// The narration runs the recipient's name straight into their bank's name. Banks are listed here
// as they are seen in real alerts; an unlisted bank leaves the whole text in `name`.
const BANK_NAMES_IN_NARRATIONS = ['Guaranty Trust Bank'];

/** Parses Moniepoint's "Debit alert!" email. No credit alert has been seen yet, so one would be flagged. */
export const parseMoniepointAlert = reportingLayoutErrors((email: AlertEmail): ParseResult => {
  if (NON_TRANSACTION_SUBJECTS.includes(email.subject.trim())) {
    return { ok: false, reason: 'not_a_transaction', detail: email.subject };
  }

  const text = flatten(email.text);
  const [amount] = capture(text, DEBIT_AMOUNT, 'Debit Amount');
  const [balance] = capture(text, BALANCE, 'Account Balance');
  const [account] = capture(text, ACCOUNT, 'Account Number');
  const [day, month, year, hour, minute, second, meridiem] = capture(
    text,
    DATE_TIME,
    'Date & Time',
  );
  const [narration] = capture(text, NARRATION, 'Narration');
  const transfer = TRANSFER_NARRATION.exec(narration!);

  const alert: ParsedAlert = {
    bank: 'moniepoint',
    direction: 'debit',
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
    counterparty: transfer ? recipient(transfer[1]!, transfer[2]!) : null,
    description: narration!,
    reference: transfer ? transfer[3]! : null,
    channel: transfer ? 'transfer' : 'unknown',
  };
  return { ok: true, alert };
});

function recipient(nameAndBank: string, maskedAccount: string): Counterparty {
  const bank = BANK_NAMES_IN_NARRATIONS.find((known) => nameAndBank.endsWith(` ${known}`));
  if (!bank) return { name: nameAndBank, bank: null, account: maskedAccount };
  return { name: nameAndBank.slice(0, -bank.length).trim(), bank, account: maskedAccount };
}
