import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { getRegistryDbPath } from '../workspace-paths';

let registryDb: Database.Database | null = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workspaces (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export interface WorkspaceRegistryEntry {
  slug: string;
  title: string;
  created_at: string;
  last_opened_at: string;
}

function openRegistryDb(): Database.Database {
  if (registryDb) return registryDb;

  const registryPath = getRegistryDbPath();
  mkdirSync(dirname(registryPath), { recursive: true });
  registryDb = new Database(registryPath);
  registryDb.pragma('journal_mode = WAL');
  registryDb.exec(SCHEMA_SQL);

  return registryDb;
}

export function getRegistryDb(): Database.Database {
  return openRegistryDb();
}

export function closeRegistryDb(): void {
  if (registryDb) {
    registryDb.close();
    registryDb = null;
  }
}

export function createWorkspaceEntry(slug: string, title: string): void {
  const db = getRegistryDb();
  db.prepare(
    "INSERT INTO workspaces (slug, title, created_at, last_opened_at) VALUES (?, ?, datetime('now'), datetime('now'))",
  ).run(slug, title);
}

export function getWorkspaceEntry(slug: string): WorkspaceRegistryEntry | undefined {
  const db = getRegistryDb();
  return db.prepare('SELECT * FROM workspaces WHERE slug = ?').get(slug) as
    | WorkspaceRegistryEntry
    | undefined;
}

export function updateWorkspaceLastOpened(slug: string): void {
  const db = getRegistryDb();
  db.prepare("UPDATE workspaces SET last_opened_at = datetime('now') WHERE slug = ?").run(slug);
}

export function updateWorkspaceTitle(slug: string, title: string): void {
  const db = getRegistryDb();
  db.prepare('UPDATE workspaces SET title = ? WHERE slug = ?').run(title, slug);
}

export function deleteWorkspaceEntry(slug: string): void {
  const db = getRegistryDb();
  db.prepare('DELETE FROM workspaces WHERE slug = ?').run(slug);
}

export function getAllWorkspaceEntries(): Map<string, WorkspaceRegistryEntry> {
  const db = getRegistryDb();
  const rows = db.prepare('SELECT * FROM workspaces').all() as WorkspaceRegistryEntry[];
  return new Map(rows.map((row) => [row.slug, row]));
}
