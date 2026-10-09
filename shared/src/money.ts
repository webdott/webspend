import type { Currency } from './api.ts';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

export const CURRENCY_NAMES: Record<Currency, string> = {
  NGN: 'Nigerian naira',
  USD: 'US dollar',
  GBP: 'British pound',
  EUR: 'Euro',
};

export function formatMinor(minor: number, currency: Currency): string {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${minor < 0 ? '−' : ''}${CURRENCY_SYMBOLS[currency]}${grouped}.${fraction}`;
}

export function formatSigned(
  minor: number,
  currency: Currency,
  type: 'expense' | 'income' | 'transfer',
): string {
  const sign = type === 'expense' ? '−' : type === 'income' ? '+' : '';
  return `${sign}${formatMinor(Math.abs(minor), currency)}`;
}

export function formatApprox(minor: number | null, currency: Currency): string | null {
  if (minor === null) return null;
  return `≈ ${formatMinor(minor, currency)}`;
}

export function formatRate(perUsd: number, currency: Currency): string {
  return `$1 = ${formatMinor(Math.round(perUsd * 100), currency)}`;
}

/**
 * Converts between currencies through US dollars using integer maths on minor units.
 * `perUsd` values are units of each currency per one dollar. Rounds half away from zero.
 */
export function convertMinor(minor: number, fromPerUsd: number, toPerUsd: number): number {
  const usd = minor / fromPerUsd;
  return roundHalfAway(usd * toPerUsd);
}

export function toUsdMinor(minor: number, perUsd: number): number {
  return roundHalfAway(minor / perUsd);
}

function roundHalfAway(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function parseMinor(input: string): number | null {
  const cleaned = input.replace(/[^\d.-]/g, '');
  if (!/^-?\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === '' || cleaned === '-') return null;
  const negative = cleaned.startsWith('-');
  const [whole = '0', fraction = ''] = cleaned.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -minor : minor;
}
