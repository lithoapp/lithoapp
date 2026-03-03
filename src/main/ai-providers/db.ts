import type Database from 'better-sqlite3';
import { getRegistryDb } from '../workspace-data/registry-db';

const AI_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS ai_credentials (
  provider_id TEXT PRIMARY KEY,
  credential_type TEXT NOT NULL,
  credential_blob TEXT NOT NULL,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_models_dev_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_models_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let initialized = false;

export function ensureAiTables(): void {
  if (initialized) return;
  getRegistryDb().exec(AI_TABLES_SQL);
  initialized = true;
}

export function getAiDb(): Database.Database {
  ensureAiTables();
  return getRegistryDb();
}
