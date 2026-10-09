import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { MetaResponse, User } from '@webspend/shared';
import { authRoutes } from '../auth/routes.ts';
import { authenticate } from '../auth/sessions.ts';
import { type Config, SERVER_DIR } from '../config.ts';
import type { Db } from '../db/index.ts';
import type { RateSource } from '../rates/source.ts';
import { errorBody, HttpError } from './errors.ts';
import { apiRoutes } from './routes.ts';

export type AppEnv = { Variables: { user: User } };

export type AppDeps = {
  db: Db;
  config: Config;
  rateSource: RateSource;
  version?: string;
};

export function buildApp({ db, config, rateSource, version = '0.1.0' }: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', cors({ origin: config.webOrigin, credentials: true }));

  app.onError((error, c) => {
    const { status, body } = errorBody(error);
    return c.json(body, status as ContentfulStatusCode);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'no such route' } }, 404));

  app.get('/healthz', (c) => c.text('ok'));
  app.get('/api/meta', (c) => {
    const meta: MetaResponse = {
      version,
      googleAuth: config.googleConfigured,
      devAuth: config.devAuth && !config.production,
    };
    return c.json(meta);
  });

  app.route('/auth', authRoutes(db, config));

  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/intake/email') return next();
    const user = await authenticate(db, c.req.raw);
    if (!user) throw new HttpError(401, 'unauthenticated', 'sign in first');
    c.set('user', user);
    await next();
  });
  app.route('/api', apiRoutes({ db, config, rateSource }));

  if (config.production) serveWebApp(app);
  return app;
}

function serveWebApp(app: Hono<AppEnv>): void {
  const dist = resolve(SERVER_DIR, '../web/dist');
  const index = join(dist, 'index.html');
  if (!existsSync(index)) return;
  // serveStatic wants a root relative to the working directory.
  const root = relative(process.cwd(), dist) || '.';
  app.use('*', serveStatic({ root }));
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/auth/')) {
      return c.json({ error: { code: 'not_found', message: 'no such route' } }, 404);
    }
    return c.html(readFileSync(index, 'utf8'));
  });
}
