/**
 * Postgres storage.
 *
 * - Hosted (Vercel): set DATABASE_URL to a Postgres connection string. The
 *   Neon integration from the Vercel Marketplace sets it automatically.
 * - Local runs and tests: without DATABASE_URL, an embedded Postgres (PGlite)
 *   stores data in KNOCKON_DATABASE_PATH (default ./data/pglite), or in memory
 *   for ":memory:". Same SQL either way.
 *
 * Workbooks, assumptions and calculations are stored as JSONB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from './errors';

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/** The small surface the repository needs: parameterised queries and transactions. */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Run `work` in one transaction; everything inside must use the `tx` it receives. */
  transaction<T>(work: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Schema migrations, applied in order and recorded in schema_migrations. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    template_id TEXT NOT NULL,
    template_version INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    baseline_scenario_id TEXT NOT NULL,
    baseline_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE scenarios (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('baseline', 'shock', 'response')),
    parent_scenario_id TEXT REFERENCES scenarios(id),
    notes TEXT NOT NULL DEFAULT '',
    workbook JSONB NOT NULL,
    assumptions JSONB NOT NULL,
    calculation JSONB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, position)
  );
  CREATE INDEX scenarios_project ON scenarios(project_id);
  `,
];

async function migrate(sql: Sql): Promise<void> {
  await sql.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  await sql.transaction(async (tx) => {
    // Serialise concurrent cold starts so two instances never apply the same migration.
    await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const { rows } = await tx.query<{ version: number | null }>('SELECT MAX(version) AS version FROM schema_migrations');
    const current = Number(rows[0]?.version ?? 0);
    for (let version = current; version < MIGRATIONS.length; version++) {
      await tx.query(MIGRATIONS[version]);
      await tx.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [version + 1, new Date().toISOString()]);
    }
  });
}

// ---------- hosted Postgres (node-postgres) ----------
async function openPostgres(url: string): Promise<Sql> {
  const { Pool } = await import('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 10_000,
    ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
  });
  const wrap = (q: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Pick<Sql, 'query'> => ({
    async query<T>(text: string, params?: unknown[]) {
      const r = await q.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
  });
  return {
    ...wrap(pool),
    async transaction<T>(work: (tx: Sql) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Sql = { ...wrap(client), transaction: (w) => w(tx), close: async () => undefined };
        const result = await work(tx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  } as Sql;
}

// ---------- embedded Postgres (PGlite) ----------
async function openPglite(location: string): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite');
  let db;
  if (location === ':memory:') {
    db = new PGlite();
  } else {
    const dir = path.resolve(location);
    fs.mkdirSync(dir, { recursive: true });
    db = new PGlite(dir);
  }
  type Q = { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> };
  const wrap = (q: Q): Pick<Sql, 'query'> => ({
    async query<T>(text: string, params?: unknown[]) {
      // Multi-statement migrations go through exec; everything else is parameterised.
      if (!params && text.includes(';') && text.trim().split(';').filter((s) => s.trim()).length > 1) {
        await (q as unknown as { exec: (t: string) => Promise<unknown> }).exec(text);
        return { rows: [], rowCount: 0 };
      }
      const r = await q.query(text, params);
      return { rows: r.rows as T[], rowCount: r.affectedRows ?? r.rows.length };
    },
  });
  return {
    ...wrap(db as unknown as Q),
    async transaction<T>(work: (tx: Sql) => Promise<T>) {
      return db.transaction(async (raw) => {
        const tx: Sql = { ...wrap(raw as unknown as Q), transaction: (w) => w(tx), close: async () => undefined } as Sql;
        return work(tx);
      });
    },
    close: () => db.close(),
  } as Sql;
}

/** Open a database: a postgres:// URL, a PGlite data directory, or ":memory:". Migrations run on open. */
export async function openDatabase(target: string): Promise<Sql> {
  const sql = /^postgres(ql)?:\/\//.test(target) ? await openPostgres(target) : await openPglite(target);
  await migrate(sql);
  return sql;
}

export function databaseTarget(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim() || env.POSTGRES_URL?.trim();
  if (url) return url;
  if (env.VERCEL) {
    // Vercel's disk is temporary: an embedded database would silently lose projects.
    throw new ApiError(
      503,
      'DATABASE_NOT_CONFIGURED',
      'Projects cannot be saved yet: no database is connected. In Vercel, add a Postgres database (Storage → Neon) to this project and redeploy.',
    );
  }
  return env.KNOCKON_DATABASE_PATH?.trim() || './data/pglite';
}

// One shared connection per process, including across Next.js dev reloads.
const store = globalThis as unknown as { __knockOnDb?: { target: string; db: Promise<Sql> } };

export function getDatabase(): Promise<Sql> {
  const target = databaseTarget();
  if (!store.__knockOnDb || store.__knockOnDb.target !== target) {
    const db = openDatabase(target);
    // A failed open (for example a wrong URL) is retried on the next request.
    db.catch(() => {
      if (store.__knockOnDb?.db === db) store.__knockOnDb = undefined;
    });
    store.__knockOnDb = { target, db };
  }
  return store.__knockOnDb.db;
}

/** Close the shared connection (tests and shutdown). */
export async function closeDatabase(): Promise<void> {
  const current = store.__knockOnDb;
  store.__knockOnDb = undefined;
  if (current) await (await current.db).close();
}
