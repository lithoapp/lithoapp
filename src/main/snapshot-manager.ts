import type { DocumentSnapshot } from '../shared/types';
import { generateId, getWorkspaceDb } from './workspace-data';

// ---- Document snapshots ----

export function readDocumentFiles(workspaceName: string, docId: string): Record<string, string> {
  const db = getWorkspaceDb(workspaceName);
  const rows = db
    .prepare('SELECT id, source FROM pages WHERE document_id = ?')
    .all(docId) as Array<{ id: string; source: string }>;

  const files: Record<string, string> = {};
  for (const row of rows) {
    files[row.id] = row.source;
  }
  return files;
}

export function createDocumentSnapshot(
  workspaceName: string,
  docId: string,
  files: Record<string, string>,
  promptExcerpt: string,
  assistantMessageId: string,
  keepCount = 20,
): string {
  const db = getWorkspaceDb(workspaceName);
  const id = generateId();

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO snapshots (id, scope, document_id, prompt_excerpt, assistant_message_id, data)
       VALUES (?, 'document', ?, ?, ?, ?)`,
    ).run(id, docId, promptExcerpt, assistantMessageId, JSON.stringify(files));

    // Prune old snapshots
    pruneSnapshots(db, 'document', docId, keepCount);
  });
  transaction();

  return id;
}

export function restoreDocumentSnapshot(
  workspaceName: string,
  docId: string,
  snapshotId: string,
): void {
  const db = getWorkspaceDb(workspaceName);

  const row = db
    .prepare("SELECT data FROM snapshots WHERE id = ? AND scope = 'document'")
    .get(snapshotId) as { data: string } | undefined;

  if (!row) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const data = JSON.parse(row.data) as Record<string, string>;

  const updatePage = db.prepare(
    "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
  );

  const transaction = db.transaction(() => {
    for (const [pageId, source] of Object.entries(data)) {
      updatePage.run(source, pageId, docId);
    }
  });
  transaction();
}

export function listDocumentSnapshots(workspaceName: string, docId: string): DocumentSnapshot[] {
  const db = getWorkspaceDb(workspaceName);

  const rows = db
    .prepare(
      `SELECT id, prompt_excerpt, assistant_message_id, data, created_at
       FROM snapshots
       WHERE scope = 'document' AND document_id = ?
       ORDER BY created_at`,
    )
    .all(docId) as Array<{
    id: string;
    prompt_excerpt: string;
    assistant_message_id: string;
    data: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.created_at,
    promptExcerpt: r.prompt_excerpt,
    assistantMessageId: r.assistant_message_id,
    data: JSON.parse(r.data),
  }));
}

export function deleteDocumentSnapshot(
  workspaceName: string,
  _docId: string,
  snapshotId: string,
): void {
  const db = getWorkspaceDb(workspaceName);
  db.prepare('DELETE FROM snapshots WHERE id = ?').run(snapshotId);
}

// ---- Styles snapshots ----

export function readStylesFile(workspaceName: string): Record<string, string> {
  const db = getWorkspaceDb(workspaceName);
  const row = db.prepare('SELECT css FROM styles WHERE id = 1').get() as
    | { css: string }
    | undefined;

  if (!row) return {};
  return { css: row.css };
}

export function createStylesSnapshot(
  workspaceName: string,
  files: Record<string, string>,
  promptExcerpt: string,
  assistantMessageId: string,
  keepCount = 20,
): string {
  const db = getWorkspaceDb(workspaceName);
  const id = generateId();

  const transaction = db.transaction(() => {
    db.prepare(
      `INSERT INTO snapshots (id, scope, document_id, prompt_excerpt, assistant_message_id, data)
       VALUES (?, 'styles', NULL, ?, ?, ?)`,
    ).run(id, promptExcerpt, assistantMessageId, JSON.stringify(files));

    pruneSnapshots(db, 'styles', null, keepCount);
  });
  transaction();

  return id;
}

export function restoreStylesSnapshot(workspaceName: string, snapshotId: string): void {
  const db = getWorkspaceDb(workspaceName);

  const row = db
    .prepare("SELECT data FROM snapshots WHERE id = ? AND scope = 'styles'")
    .get(snapshotId) as { data: string } | undefined;

  if (!row) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const data = JSON.parse(row.data) as Record<string, string>;
  const css = data.css;

  if (css !== undefined) {
    db.prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1").run(css);
  }
}

export function listStylesSnapshots(workspaceName: string): DocumentSnapshot[] {
  const db = getWorkspaceDb(workspaceName);

  const rows = db
    .prepare(
      `SELECT id, prompt_excerpt, assistant_message_id, data, created_at
       FROM snapshots
       WHERE scope = 'styles'
       ORDER BY created_at`,
    )
    .all() as Array<{
    id: string;
    prompt_excerpt: string;
    assistant_message_id: string;
    data: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.created_at,
    promptExcerpt: r.prompt_excerpt,
    assistantMessageId: r.assistant_message_id,
    data: JSON.parse(r.data),
  }));
}

export function deleteStylesSnapshot(workspaceName: string, snapshotId: string): void {
  const db = getWorkspaceDb(workspaceName);
  db.prepare('DELETE FROM snapshots WHERE id = ?').run(snapshotId);
}

// ---- Prune helper ----

function pruneSnapshots(
  db: import('better-sqlite3').Database,
  scope: string,
  documentId: string | null,
  keepCount: number,
): void {
  const whereClause =
    documentId !== null
      ? 'WHERE scope = ? AND document_id = ?'
      : 'WHERE scope = ? AND document_id IS NULL';
  const params = documentId !== null ? [scope, documentId] : [scope];

  const count = (
    db.prepare(`SELECT COUNT(*) as c FROM snapshots ${whereClause}`).get(...params) as {
      c: number;
    }
  ).c;

  if (count <= keepCount) return;

  const toDelete = count - keepCount;

  const ids = db
    .prepare(`SELECT id FROM snapshots ${whereClause} ORDER BY created_at ASC LIMIT ?`)
    .all(...params, toDelete) as Array<{ id: string }>;

  const deleteStmt = db.prepare('DELETE FROM snapshots WHERE id = ?');
  for (const { id } of ids) {
    deleteStmt.run(id);
  }
}
