import { parseGreyAlert } from './grey.ts';
import { parseGtbankAlert } from './gtbank.ts';
import { parseMoniepointAlert } from './moniepoint.ts';
import { parseOpayAlert } from './opay.ts';
import type { AlertEmail, AlertParser, ParseResult } from './types.ts';

export type { AlertEmail, ParsedAlert, ParseResult } from './types.ts';

// Keyed by the exact address each bank sends transaction alerts from. Their marketing mail
// comes from other addresses and is rejected as an unknown sender.
const PARSER_BY_SENDER: Record<string, AlertParser> = {
  'no-reply@opay-nigeria.com': parseOpayAlert,
  'no-reply@moniepoint.com': parseMoniepointAlert,
  'gens@gtbank.com': parseGtbankAlert,
  'hello@grey.co': parseGreyAlert,
};

export const ALERT_SENDERS: readonly string[] = Object.keys(PARSER_BY_SENDER);

export function parseAlert(email: AlertEmail): ParseResult {
  const sender = senderAddress(email.from);
  const parse = PARSER_BY_SENDER[sender];
  if (!parse) return { ok: false, reason: 'unknown_sender', detail: sender };
  return parse(email);
}

function senderAddress(from: string): string {
  const bracketed = /<([^>]+)>/.exec(from);
  return (bracketed?.[1] ?? from).trim().toLowerCase();
}
