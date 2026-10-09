/**
 * Gmail as a `MailboxSource`, over the REST API with plain `fetch`. Read-only: it lists messages
 * from the bank senders and fetches their headers and bodies, nothing else.
 */
import type { Db } from '../db/index.ts';
import { isoOrNull } from '../db/rows.ts';
import { htmlToText } from './html.ts';
import type { MailboxMessage, MailboxSource } from './mailbox.ts';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type GoogleCredentials = { clientId: string; clientSecret: string };

type GmailHeader = { name: string; value: string };
type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};
type GmailMessage = { id: string; internalDate?: string; payload?: GmailPart };

export class GmailSource implements MailboxSource {
  readonly #db: Db;
  readonly #userId: string;
  readonly #credentials: GoogleCredentials;

  constructor(db: Db, userId: string, credentials: GoogleCredentials) {
    this.#db = db;
    this.#userId = userId;
    this.#credentials = credentials;
  }

  async listMessageIds(opts: { senders: string[]; after: Date }): Promise<string[]> {
    const from = opts.senders.join(' OR ');
    const query = `from:(${from}) after:${Math.floor(opts.after.getTime() / 1000)}`;
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ q: query, maxResults: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const page = (await this.#get(`/messages?${params}`)) as {
        messages?: { id: string }[];
        nextPageToken?: string;
      };
      for (const message of page.messages ?? []) ids.push(message.id);
      pageToken = page.nextPageToken;
    } while (pageToken);
    // Oldest first, so the balance chain is built in the order the bank sent the alerts.
    return ids.reverse();
  }

  async fetchMessage(id: string): Promise<MailboxMessage> {
    const message = (await this.#get(`/messages/${id}?format=full`)) as GmailMessage;
    return messageFromPayload(message);
  }

  async #get(path: string): Promise<unknown> {
    let response = await this.#fetch(path, await this.#accessToken());
    // A stored token can be revoked before it expires (access removed, then granted again), so
    // a 401 gets one more try with a newly issued token.
    if (response.status === 401) response = await this.#fetch(path, await this.#accessToken(true));
    if (!response.ok) {
      const reason = await googleErrorMessage(response);
      throw new Error(`gmail ${path.split('?')[0]} answered ${response.status}: ${reason}`);
    }
    return response.json();
  }

  #fetch(path: string, token: string): Promise<Response> {
    return fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
  }

  async #accessToken(forceRefresh = false): Promise<string> {
    const [row] = await this.#db.query<{
      refresh_token: string;
      access_token: string | null;
      expires_at: unknown;
    }>('select refresh_token, access_token, expires_at from mailbox_tokens where user_id = $1', [
      this.#userId,
    ]);
    if (!row) throw new Error('no mailbox token for this user');
    const expiresAt = isoOrNull(row.expires_at);
    const stillValid = expiresAt !== null && Date.parse(expiresAt) - Date.now() > 60_000;
    if (!forceRefresh && row.access_token && stillValid) {
      return row.access_token;
    }
    const fresh = await refreshAccessToken(this.#credentials, row.refresh_token);
    await this.#db.query(
      `update mailbox_tokens set access_token = $2, expires_at = $3::timestamptz, updated_at = now()
       where user_id = $1`,
      [this.#userId, fresh.accessToken, fresh.expiresAt],
    );
    return fresh.accessToken;
  }
}

export async function refreshAccessToken(
  credentials: GoogleCredentials,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    // 400 invalid_grant: access was removed or the grant expired, so only signing in again helps.
    const hint = response.status === 400 ? ' (sign in to WebSpend with Google again)' : '';
    throw new Error(`google token refresh answered ${response.status}${hint}`);
  }
  const body = (await response.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

export function messageFromPayload(message: GmailMessage): MailboxMessage {
  const headers = message.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
  const dateHeader = header('Date');
  const receivedMs = message.internalDate ? Number(message.internalDate) : Date.parse(dateHeader);
  const plain = findPart(message.payload, 'text/plain');
  const html = findPart(message.payload, 'text/html');
  const text = plain ? decodeBody(plain) : html ? htmlToText(decodeBody(html)) : '';
  return {
    messageId: message.id,
    from: header('From'),
    subject: header('Subject'),
    text,
    receivedAt: new Date(Number.isFinite(receivedMs) ? receivedMs : Date.now()).toISOString(),
    authenticated: isAuthenticated(header('Authentication-Results')),
  };
}

/** Fake bank alerts are common, so a message counts only when Gmail saw it pass SPF and DKIM. */
export function isAuthenticated(authenticationResults: string): boolean {
  const results = authenticationResults.toLowerCase();
  if (results.includes('arc=pass')) return true;
  return results.includes('dkim=pass') && results.includes('spf=pass');
}

function findPart(part: GmailPart | undefined, mimeType: string): GmailPart | null {
  if (!part) return null;
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return null;
}

function decodeBody(part: GmailPart): string {
  return Buffer.from(part.body?.data ?? '', 'base64url').toString('utf8');
}

async function googleErrorMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? 'no reason given';
}
