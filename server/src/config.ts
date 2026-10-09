import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Currency } from '@webspend/shared';

export type RateSourceName = 'open-er-api' | 'fixed';

export type Config = {
  port: number;
  databaseUrl: string | undefined;
  pgliteDir: string;
  publicUrl: string;
  webOrigin: string;
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  googleConfigured: boolean;
  devAuth: boolean;
  intakeSecret: string | undefined;
  pollIntervalSeconds: number;
  rateSource: RateSourceName;
  fixedRates: Partial<Record<Currency, number>>;
  production: boolean;
};

export const SERVER_DIR = fileURLToPath(new URL('../', import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const googleClientId = blankToUndefined(env.GOOGLE_CLIENT_ID);
  const googleClientSecret = blankToUndefined(env.GOOGLE_CLIENT_SECRET);
  return {
    port: integer(env.PORT, 8787),
    databaseUrl: blankToUndefined(env.DATABASE_URL),
    pgliteDir: resolve(SERVER_DIR, env.PGLITE_DIR || 'data/webspend'),
    publicUrl: trimSlash(env.PUBLIC_URL || 'http://localhost:8787'),
    webOrigin: trimSlash(env.WEB_ORIGIN || 'http://localhost:5173'),
    googleClientId,
    googleClientSecret,
    googleConfigured: Boolean(googleClientId && googleClientSecret),
    devAuth: env.DEV_AUTH === undefined ? !production : env.DEV_AUTH === '1',
    intakeSecret: blankToUndefined(env.INTAKE_SECRET),
    pollIntervalSeconds: integer(env.POLL_INTERVAL_SECONDS, 60),
    rateSource: env.RATE_SOURCE === 'fixed' ? 'fixed' : 'open-er-api',
    fixedRates: parseFixedRates(env.FIXED_RATES),
    production,
  };
}

export function loadDotEnv(): void {
  const file = resolve(SERVER_DIR, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/** `NGN:1500,GBP:0.78,EUR:0.92` → `{ NGN: 1500, GBP: 0.78, EUR: 0.92 }`. */
export function parseFixedRates(text: string | undefined): Partial<Record<Currency, number>> {
  const rates: Partial<Record<Currency, number>> = {};
  for (const pair of (text ?? '').split(',')) {
    const [code, value] = pair.split(':').map((part) => part.trim());
    const perUsd = Number(value);
    if (!code || !Number.isFinite(perUsd) || perUsd <= 0) continue;
    if (code === 'NGN' || code === 'USD' || code === 'GBP' || code === 'EUR') rates[code] = perUsd;
  }
  return rates;
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function blankToUndefined(value: string | undefined): string | undefined {
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
