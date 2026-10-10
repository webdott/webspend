export type Bank = 'opay' | 'moniepoint' | 'gtbank' | 'grey';

/**
 * The parts of an incoming email the parsers need.
 *
 * Parsers trust `from`. Intake must reject mail that fails sender authentication (SPF/DKIM)
 * before it gets here, because fake bank alerts are a common fraud.
 */
export type AlertEmail = {
  from: string;
  subject: string;
  text: string;
};

export type Counterparty = {
  name: string | null;
  bank: string | null;
  /** As the alert shows it, which may be masked (`*****50645`). */
  account: string | null;
};

export type ParsedAlert = {
  bank: Bank;
  direction: 'debit' | 'credit';
  /** Kobo or cents. Money is never held as a decimal, so totals stay exact. */
  amountMinor: number;
  currency: 'NGN' | 'USD';
  /** ISO 8601 in Lagos time (+01:00), the zone every alert reports in. */
  occurredAt: string;
  /** The user's own account as the alert shows it. Null when the alert omits it (OPay). */
  account: string | null;
  /** Null when the alert carries no balance (Grey), which skips the balance check. */
  balanceAfterMinor: number | null;
  counterparty: Counterparty | null;
  /** The bank's own wording, kept verbatim for display and for pairing transfers later. */
  description: string;
  reference: string | null;
  channel: 'transfer' | 'card' | 'payment' | 'unknown';
};

export type ParseFailureReason =
  | 'unknown_sender'
  | 'not_a_transaction'
  /** A bank email we could not read. Must be surfaced, never dropped: the layout may have changed. */
  | 'unrecognised_layout';

export type ParseResult =
  { ok: true; alert: ParsedAlert } | { ok: false; reason: ParseFailureReason; detail: string };

export type AlertParser = (email: AlertEmail) => ParseResult;
