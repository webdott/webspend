/**
 * Session tokens. The token is 32 random bytes; only its SHA-256 is stored, so a database copy
 * cannot be used to sign in. The same token works as a bearer header or as the `ws_session` cookie.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@webspend/shared';
import type { Db } from '../db/index.ts';
import { getUser } from '../ledger/users.ts';

export const SESSION_COOKIE = 'ws_session';
export type Client = 'web' | 'mac' | 'iphone';

export async function createSession(db: Db, userId: string, client: Client): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.query('insert into sessions (user_id, token_hash, client) values ($1, $2, $3)', [
    userId,
    hash(token),
    client,
  ]);
  return token;
}

/** The user behind a request's bearer header or session cookie, or null. Touches `last_used_at`. */
export async function authenticate(db: Db, req: Request): Promise<User | null> {
  const token = tokenFrom(req);
  if (!token) return null;
  const [row] = await db.query<{ user_id: string }>(
    'update sessions set last_used_at = now() where token_hash = $1 returning user_id',
    [hash(token)],
  );
  return row ? getUser(db, row.user_id) : null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query('delete from sessions where token_hash = $1', [hash(token)]);
}

export function tokenFrom(req: Request): string | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (bearer) return bearer[1]!;
  const cookies = req.headers.get('cookie') ?? '';
  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
