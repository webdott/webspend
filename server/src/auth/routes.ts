import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { devSignInSchema, type SessionResponse } from '@webspend/shared';
import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { ensureUser } from '../ledger/users.ts';
import { HttpError, parseBody } from '../api/errors.ts';
import { completeSignIn, consentUrl, emailFromTokens, exchangeCode, takeState } from './google.ts';
import {
  type Client,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  tokenFrom,
} from './sessions.ts';

const CLIENTS: Client[] = ['web', 'mac', 'iphone'];

export function authRoutes(db: Db, config: Config): Hono {
  const auth = new Hono();
  const cookieOptions = {
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: config.publicUrl.startsWith('https://'),
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  };

  auth.get('/google', (c) => {
    if (!config.googleConfigured)
      throw new HttpError(404, 'not_found', 'Google sign-in is not configured');
    const client = c.req.query('client') ?? 'web';
    if (!CLIENTS.includes(client as Client)) {
      throw new HttpError(400, 'invalid_request', 'client must be web, mac or iphone');
    }
    return c.redirect(consentUrl(config, client as Client));
  });

  auth.get('/google/callback', async (c) => {
    if (!config.googleConfigured)
      throw new HttpError(404, 'not_found', 'Google sign-in is not configured');
    const error = c.req.query('error');
    if (error) throw new HttpError(400, 'invalid_request', `Google sign-in failed: ${error}`);
    const client = takeState(c.req.query('state') ?? '');
    const code = c.req.query('code');
    if (!client || !code) throw new HttpError(400, 'invalid_request', 'sign-in expired, try again');

    const tokens = await exchangeCode(config, code);
    const email = await emailFromTokens(tokens);
    const user = await completeSignIn(db, email, tokens);
    const token = await createSession(db, user.id, client);
    if (client === 'web') {
      setCookie(c, SESSION_COOKIE, token, cookieOptions);
      return c.redirect(config.production ? '/' : config.webOrigin);
    }
    return c.redirect(`webspend://signed-in#token=${token}`);
  });

  auth.post('/dev', async (c) => {
    if (!config.devAuth) throw new HttpError(404, 'not_found', 'dev sign-in is off');
    const { email } = await parseBody(c, devSignInSchema);
    const user = await ensureUser(db, email);
    const token = await createSession(db, user.id, 'web');
    setCookie(c, SESSION_COOKIE, token, cookieOptions);
    const body: SessionResponse = { token, user };
    return c.json(body);
  });

  auth.post('/logout', async (c) => {
    const token = tokenFrom(c.req.raw);
    if (token) await deleteSession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  return auth;
}
