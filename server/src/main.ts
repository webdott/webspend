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

// Render's free tier sleeps a service after 15 idle minutes and takes most of a minute to wake.
// A request to its own public URL counts as traffic, so one every ten minutes keeps it up even
// when no app is open. Off locally; KEEP_AWAKE=0 turns it off anywhere.
const KEEP_AWAKE_MS = 10 * 60 * 1000;
const keepAwake = async () => {
  try {
    await fetch(`${config.publicUrl}/healthz`, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    console.warn(`keep-awake: ping failed: ${(error as Error).message}`);
  }
};
const keepAwakeTimer = config.keepAwake ? setInterval(keepAwake, KEEP_AWAKE_MS) : null;
keepAwakeTimer?.unref();
if (keepAwakeTimer) console.log(`  keep-awake: pinging ${config.publicUrl}/healthz every 10 min`);

const stopPoller = config.googleConfigured ? startPoller(db, config, { rateSource }) : () => {};

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  stopPoller();
  clearInterval(rateTimer);
  if (keepAwakeTimer) clearInterval(keepAwakeTimer);
  server.close(() => {
    db.close().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
