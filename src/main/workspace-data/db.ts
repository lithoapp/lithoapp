/**
 * SQLite database module for workspace data.
 *
 * Each workspace gets its own `workspace.db` inside `~/litho-workspaces/{name}/`.
 * Connections are cached and reused across calls.
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { resolveWorkspacePath } from '../workspace-paths';

const connections = new Map<string, Database.Database>();

const SCHEMA_VERSION = 2;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder TEXT,
  size_preset TEXT,
  size_width REAL NOT NULL,
  size_height REAL NOT NULL,
  size_unit TEXT NOT NULL DEFAULT 'mm',
  position REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  source,
  content='pages',
  content_rowid='rowid'
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS pages_fts_insert AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, source) VALUES (NEW.rowid, NEW.source);
END;

CREATE TRIGGER IF NOT EXISTS pages_fts_delete AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, source) VALUES ('delete', OLD.rowid, OLD.source);
END;

CREATE TRIGGER IF NOT EXISTS pages_fts_update AFTER UPDATE OF source ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, source) VALUES ('delete', OLD.rowid, OLD.source);
  INSERT INTO pages_fts(rowid, source) VALUES (NEW.rowid, NEW.source);
END;

CREATE TABLE IF NOT EXISTS styles (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  css TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('document', 'styles')),
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  prompt_excerpt TEXT,
  assistant_message_id TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_lookup
  ON snapshots(scope, document_id, created_at);
`;

function applyMigrations(db: Database.Database): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  if (currentVersion >= SCHEMA_VERSION) return;

  if (currentVersion === 0) {
    // Fresh database — run full schema
    db.exec(SCHEMA_SQL);
  } else {
    // Incremental migrations
    if (currentVersion < 2) {
      db.exec("ALTER TABLE pages ADD COLUMN name TEXT NOT NULL DEFAULT ''");
    }
  }

  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

export function openWorkspaceDb(workspaceName: string): Database.Database {
  const existing = connections.get(workspaceName);
  if (existing) return existing;

  const wsPath = resolveWorkspacePath(workspaceName);
  mkdirSync(wsPath, { recursive: true });
  const dbPath = `${wsPath}/workspace.db`;

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  applyMigrations(db);

  connections.set(workspaceName, db);
  return db;
}

export function getWorkspaceDb(workspaceName: string): Database.Database {
  return openWorkspaceDb(workspaceName);
}

export function closeWorkspaceDb(workspaceName: string): void {
  const db = connections.get(workspaceName);
  if (db) {
    db.close();
    connections.delete(workspaceName);
  }
}

export function closeAllDbs(): void {
  for (const [name, db] of connections) {
    db.close();
    connections.delete(name);
  }
}

/** Generate a 12-char alphanumeric ID using crypto.randomBytes. */
export function generateId(): string {
  return randomBytes(9).toString('base64url').slice(0, 12);
}
