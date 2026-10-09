/**
 * Google sign-in with Gmail read access. The email that signs in is the inbox that gets read,
 * so one consent covers both. The refresh token is kept in `mailbox_tokens` for the poller.
 */
import { randomBytes } from 'node:crypto';
import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { ensureUser } from '../ledger/users.ts';
import type { Client } from './sessions.ts';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const SCOPES = ['openid', 'email', GMAIL_SCOPE];
const STATE_TTL_MS = 10 * 60 * 1000;

// Pending sign-ins, keyed by state. Lost on restart, which only means signing in again.
const pendingStates = new Map<string, { client: Client; expiresAt: number }>();

export function redirectUri(config: Config): string {
  return `${config.publicUrl}/auth/google/callback`;
}

export function consentUrl(config: Config, client: Client): string {
  const state = randomBytes(16).toString('base64url');
  pendingStates.set(state, { client, expiresAt: Date.now() + STATE_TTL_MS });
  const params = new URLSearchParams({
    client_id: config.googleClientId!,
    redirect_uri: redirectUri(config),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export function takeState(state: string): Client | null {
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  for (const [key, value] of pendingStates)
    if (value.expiresAt < Date.now()) pendingStates.delete(key);
  if (!pending || pending.expiresAt < Date.now()) return null;
  return pending.client;
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  /** The scopes the person actually granted, space-separated. */
  scope?: string;
};

/** Google lets people untick individual permissions, so the mailbox one has to be checked for. */
export function grantsMailbox(tokens: GoogleTokens): boolean {
  return (tokens.scope ?? '').split(' ').includes(GMAIL_SCOPE);
}

export async function exchangeCode(config: Config, code: string): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.googleClientId!,
      client_secret: config.googleClientSecret!,
      redirect_uri: redirectUri(config),
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`google token exchange answered ${response.status}`);
  return (await response.json()) as GoogleTokens;
}

export async function emailFromTokens(tokens: GoogleTokens): Promise<string> {
  const fromIdToken = tokens.id_token ? emailFromIdToken(tokens.id_token) : null;
  if (fromIdToken) return fromIdToken;
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`google userinfo answered ${response.status}`);
  const info = (await response.json()) as { email?: string };
  if (!info.email) throw new Error('google did not return an email');
  return info.email;
}

// The id token came straight from Google over TLS in the code exchange, so reading its payload
// without verifying the signature is safe here.
function emailFromIdToken(idToken: string): string | null {
  const payload = idToken.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string;
    };
    return claims.email ?? null;
  } catch {
    return null;
  }
}

export async function completeSignIn(db: Db, email: string, tokens: GoogleTokens) {
  const user = await ensureUser(db, email);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  if (tokens.refresh_token) {
    await db.query(
      `insert into mailbox_tokens (user_id, provider, refresh_token, access_token, expires_at)
       values ($1, 'gmail', $2, $3, $4::timestamptz)
       on conflict (user_id) do update set refresh_token = excluded.refresh_token,
         access_token = excluded.access_token, expires_at = excluded.expires_at,
         last_error = null, updated_at = now()`,
      [user.id, tokens.refresh_token, tokens.access_token, expiresAt],
    );
  } else {
    // Google only sends a refresh token on the first consent for a client. Keep the one we have.
    await db.query(
      `update mailbox_tokens set access_token = $2, expires_at = $3::timestamptz, updated_at = now()
       where user_id = $1`,
      [user.id, tokens.access_token, expiresAt],
    );
  }
  return user;
}
