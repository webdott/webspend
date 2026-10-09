import {
  capture,
  flatten,
  lagosIso,
  LayoutError,
  monthNumber,
  reportingLayoutErrors,
  toMinor,
} from './text.ts';
import type { AlertEmail, ParsedAlert, ParseResult } from './types.ts';

const HEADLINE =
  /Your (transfer|payment) of ₦([\d,]+\.\d{2}) is successful\. Your available balance is ₦([\d,]+\.\d{2})/;
const TRANSACTION_DATE =
  /Transaction Date: (\w{3}) (\d{1,2})(?:st|nd|rd|th), (\d{4}) (\d{2}):(\d{2}):(\d{2})/;
const TRANSACTION_NUMBER = /Transaction No\.: (\d+)/;
const RECIPIENT = /Name: (.+?) Bank: (.+?) Account Number: (\d+)/;
const MERCHANT = /Merchant Name: (.+?) Merchant Order Number: (\S+)/;

/** Parses OPay's "Transfer Successful" and "Payment Successful" emails. OPay only emails money going out. */
export const parseOpayAlert = reportingLayoutErrors((email: AlertEmail): ParseResult => {
  const text = flatten(email.text);
  const [kind, amount, balance] = capture(text, HEADLINE, 'the amount and balance line');
  const [month, day, year, hour, minute, second] = capture(
    text,
    TRANSACTION_DATE,
    'Transaction Date',
  );
  const [reference] = capture(text, TRANSACTION_NUMBER, 'Transaction No.');

  const common = {
    bank: 'opay',
    direction: 'debit',
    amountMinor: toMinor(amount!),
    currency: 'NGN',
    occurredAt: lagosIso({
      year: Number(year),
      month: monthNumber(month!),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
    }),
    account: null,
    balanceAfterMinor: toMinor(balance!),
    reference: reference!,
  } satisfies Partial<ParsedAlert>;

  if (kind === 'transfer') {
    const [name, bank, account] = capture(text, RECIPIENT, 'the recipient');
    return {
      ok: true,
      alert: {
        ...common,
        channel: 'transfer',
        counterparty: { name: name!, bank: bank!, account: account! },
        description: `Transfer to ${name}`,
      },
    };
  }

  if (kind === 'payment') {
    // The merchant is usually a payment processor (Paystack), not the shop, so the user has to
    // say what the payment was for. The order number is kept to help them recognise it.
    const [merchant, orderNumber] = capture(text, MERCHANT, 'the merchant');
    return {
      ok: true,
      alert: {
        ...common,
        channel: 'payment',
        counterparty: { name: merchant!, bank: null, account: null },
        description: `Payment to ${merchant} (order ${orderNumber})`,
      },
    };
  }

  throw new LayoutError(`unknown OPay alert kind "${kind}"`);
});
