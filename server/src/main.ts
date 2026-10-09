import { serve } from '@hono/node-server';
import { buildApp } from './api/app.ts';
import { loadConfig, loadDotEnv } from './config.ts';
import { openConfiguredDb } from './db/open.ts';
import { startPoller } from './intake/poller.ts';
import { rateSourceFor, refreshToday } from './rates/index.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

loadDotEnv();
const config = loadConfig();
const db = await openConfiguredDb(config);
const rateSource = rateSourceFor(config);
const app = buildApp({ db, config, rateSource });

const server = serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`webspend server listening on http://localhost:${config.port}`);
  console.log(`  database: ${config.databaseUrl ? 'postgres' : `pglite at ${config.pgliteDir}`}`);
  console.log(
    `  dev sign-in: ${config.devAuth && !config.production ? 'on (POST /auth/dev)' : 'off'}`,
  );
  console.log(`  google sign-in: ${config.googleConfigured ? 'configured' : 'not configured'}`);
  console.log(`  rates: ${rateSource.name}`);
});

const refreshRates = async () => {
  try {
    await refreshToday(db, rateSource);
    console.log('rates: refreshed');
  } catch (error) {
    // The network may be down at start; transactions fall back to the last stored day.
    console.warn(`rates: refresh failed, using stored rates: ${(error as Error).message}`);
  }
};
void refreshRates();
const rateTimer = setInterval(refreshRates, DAY_MS);
rateTimer.unref();

const stopPoller = config.googleConfigured ? startPoller(db, config, { rateSource }) : () => {};

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  stopPoller();
  clearInterval(rateTimer);
  server.close(() => {
    db.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
