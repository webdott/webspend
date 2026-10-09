/**
 * One small database interface with two backends that speak the same SQL:
 * - PGlite, an embedded Postgres, when `DATABASE_URL` is unset. Stores under `server/data/`.
 *   Tests use it in memory. No install needed.
 * - A real Postgres via postgres.js when `DATABASE_URL` is set.
 *
 * Both are configured so `bigint` columns come back as JavaScript numbers (money never exceeds
 * 2^53 kobo) and `numeric` columns come back as strings, which callers turn into numbers.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Row = Record<string, unknown>;

export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
  /** Runs `fn` inside one transaction. The callback's `Db` must be used for every statement. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type DbOptions = {
  url?: string;
  dataDir?: string;
};

export async function openDb(options: DbOptions = {}): Promise<Db> {
  const db = options.url
    ? await openPostgres(options.url)
    : await openPglite(options.dataDir ?? 'memory://');
  await migrate(db);
  return db;
}

type PgliteRunner = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (text: string) => Promise<unknown>;
};

async function openPglite(dataDir: string): Promise<Db> {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const pg = await PGlite.create(dataDir, {
    parsers: { [types.INT8]: (value: string) => Number(value) },
  });
  const statements = (runner: PgliteRunner): Pick<Db, 'query' | 'exec'> => ({
    async query<T extends Row>(text: string, params: unknown[] = []) {
      const result = await runner.query(text, params);
      return result.rows as T[];
    },
    async exec(text: string) {
      await runner.exec(text);
    },
  });
  const db: Db = {
    ...statements(pg),
    transaction(fn) {
      return pg.transaction(async (tx) => {
        const scoped: Db = {
          ...statements(tx),
          transaction: (inner) => inner(scoped),
          close: async () => {},
        };
        return fn(scoped);
      });
    },
    close: () => pg.close(),
  };
  return db;
}

async function openPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    types: {
      bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: Number },
    },
  });
  type Runner = Pick<typeof sql, 'unsafe'>;
  const statements = (runner: Runner): Pick<Db, 'query' | 'exec'> => ({
    async query<T extends Row>(text: string, params: unknown[] = []) {
      return (await runner.unsafe(text, params as never)) as unknown as T[];
    },
    async exec(text: string) {
      await runner.unsafe(text);
    },
  });
  const db: Db = {
    ...statements(sql),
    transaction(fn) {
      return sql.begin(async (tx) => {
        const scoped: Db = {
          ...statements(tx as unknown as Runner),
          transaction: (inner) => inner(scoped),
          close: async () => {},
        };
        return fn(scoped);
      }) as Promise<never>;
    },
    close: () => sql.end(),
  };
  return db;
}

export async function migrate(db: Db): Promise<void> {
  await db.exec(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const applied = new Set(
    (await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name),
  );
  const dir = fileURLToPath(new URL('./migrations/', import.meta.url));
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(`${dir}${file}`, 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (name) values ($1)', [file]);
    });
  }
}
