/**
 * Local SQLite storage using Node's built-in `node:sqlite` module (Node 22.13+).
 *
 * One file on durable disk for a local single-user prototype. Choose a hosted
 * database before a multi-user release (docs/BUILD_BRIEF.md). Workbooks,
 * assumptions, and calculations are stored as JSON text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DATABASE_PATH = './data/knockon.db';

/** Schema migrations, applied in order. The index + 1 is the stored user_version. */
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
    baseline_frozen INTEGER NOT NULL DEFAULT 0,
    demo INTEGER NOT NULL DEFAULT 0,
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
    workbook TEXT NOT NULL,
    assumptions TEXT NOT NULL,
    calculation TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (project_id, position)
  );
  CREATE INDEX scenarios_project ON scenarios(project_id);
  `,
];

function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function openDatabase(filePath: string): DatabaseSync {
  if (filePath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

// Reuse one connection per process, including across Next.js dev reloads.
const globalStore = globalThis as unknown as { __knockOnDb?: { path: string; db: DatabaseSync } };

export function getDatabase(): DatabaseSync {
  const filePath = process.env.KNOCKON_DATABASE_PATH?.trim() || DEFAULT_DATABASE_PATH;
  if (!globalStore.__knockOnDb || globalStore.__knockOnDb.path !== filePath) {
    globalStore.__knockOnDb?.db.close();
    globalStore.__knockOnDb = { path: filePath, db: openDatabase(filePath) };
  }
  return globalStore.__knockOnDb.db;
}

/** Close the shared connection (tests and shutdown). */
export function closeDatabase(): void {
  globalStore.__knockOnDb?.db.close();
  globalStore.__knockOnDb = undefined;
}

/** Run `work` in one write transaction. Everything inside must be synchronous. */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
