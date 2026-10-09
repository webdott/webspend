import { mkdirSync } from 'node:fs';
import type { Config } from '../config.ts';
import { type Db, openDb } from './index.ts';

export async function openConfiguredDb(config: Config): Promise<Db> {
  if (config.databaseUrl) return openDb({ url: config.databaseUrl });
  // PGlite creates its own folder but not the folders above it.
  mkdirSync(config.pgliteDir, { recursive: true });
  return openDb({ dataDir: config.pgliteDir });
}
