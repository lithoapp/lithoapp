import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type {
  DesignSystem,
  DocumentConfig,
  DocumentInfo,
  PageInfo,
  PageSize,
} from '../../shared/types';
import { resolveWorkspacePath, WORKSPACES_BASE } from '../workspace-paths';
import { generateId, getWorkspaceDb } from './db';
import {
  applyUpdates,
  categorizeTokens,
  DEFAULT_STYLES_CSS,
  parseThemeBlock,
  serializeFullCss,
  slugify,
} from './design-system-parser';

// ---------------------------------------------------------------------------
// Workspace operations (still filesystem-based — workspaces are directories)
// ---------------------------------------------------------------------------

export async function listWorkspaces(): Promise<string[]> {
  if (!existsSync(WORKSPACES_BASE)) return [];
  return readdirSync(WORKSPACES_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function readWorkspaceConfig(workspace: string): Promise<{ name: string }> {
  return { name: workspace };
}

export async function createNewWorkspace(name: string): Promise<string> {
  const slug = slugify(name) || 'untitled';
  const root = resolveWorkspacePath(slug);

  if (existsSync(root)) {
    throw new Error(`A project named "${slug}" already exists. Choose a different name.`);
  }

  mkdirSync(join(root, 'assets'), { recursive: true });

  // Opening the db creates workspace.db and runs migrations
  const db = getWorkspaceDb(slug);

  // Insert default styles row
  db.prepare('INSERT INTO styles (id, css) VALUES (1, ?)').run(DEFAULT_STYLES_CSS);

  return slug;
}

// ---------------------------------------------------------------------------
// Document CRUD
// ---------------------------------------------------------------------------

export async function listDocuments(workspace: string): Promise<string[]> {
  const db = getWorkspaceDb(workspace);
  const rows = db.prepare('SELECT id FROM documents ORDER BY position').all() as { id: string }[];
  return rows.map((r) => r.id);
}

export async function getDocumentCount(workspace: string): Promise<number> {
  const db = getWorkspaceDb(workspace);
  const row = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number };
  return row.count;
}

export async function readDocumentConfig(
  workspace: string,
  document: string,
): Promise<DocumentConfig> {
  const db = getWorkspaceDb(workspace);

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(document) as
    | {
        id: string;
        title: string;
        size_preset: string | null;
        size_width: number;
        size_height: number;
        size_unit: string;
      }
    | undefined;

  if (!doc) {
    throw new Error(`Document "${document}" not found in workspace "${workspace}"`);
  }

  const pages = db
    .prepare('SELECT id, name, description FROM pages WHERE document_id = ? ORDER BY position')
    .all(document) as PageInfo[];

  const size: PageSize = {
    width: doc.size_width,
    height: doc.size_height,
    unit: doc.size_unit as 'mm' | 'px',
  };

  return { title: doc.title, size, pages };
}

export async function createDocument(
  workspace: string,
  title: string,
  size: string | PageSize,
  folder?: string,
): Promise<string> {
  const db = getWorkspaceDb(workspace);

  let resolvedSize: PageSize;
  let sizePreset: string | null = null;

  if (typeof size === 'string') {
    const { PAGE_SIZES: sizes } = await import('../../shared/types');
    const preset = sizes[size];
    if (!preset) {
      throw new Error(`Unknown page size preset "${size}"`);
    }
    resolvedSize = preset;
    sizePreset = size;
  } else {
    resolvedSize = size;
  }

  const docId = generateId();

  // Get max position for ordering
  const maxPos = db.prepare('SELECT MAX(position) as maxPos FROM documents').get() as {
    maxPos: number | null;
  };
  const docPosition = (maxPos.maxPos ?? 0) + 1;

  db.prepare(
    `INSERT INTO documents (id, title, folder, size_preset, size_width, size_height, size_unit, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    docId,
    title,
    folder || null,
    sizePreset,
    resolvedSize.width,
    resolvedSize.height,
    resolvedSize.unit,
    docPosition,
  );

  return docId;
}

export async function deleteDocument(workspace: string, document: string): Promise<void> {
  const db = getWorkspaceDb(workspace);
  const result = db.prepare('DELETE FROM documents WHERE id = ?').run(document);
  if (result.changes === 0) {
    throw new Error(`Document "${document}" not found.`);
  }
}

export async function updateDocumentFolder(
  workspace: string,
  document: string,
  folder: string,
): Promise<void> {
  const db = getWorkspaceDb(workspace);
  db.prepare("UPDATE documents SET folder = ?, updated_at = datetime('now') WHERE id = ?").run(
    folder || null,
    document,
  );
}

export async function listDocumentsFull(workspace: string): Promise<DocumentInfo[]> {
  const db = getWorkspaceDb(workspace);

  const docs = db.prepare('SELECT * FROM documents ORDER BY position').all() as Array<{
    id: string;
    title: string;
    folder: string | null;
    size_preset: string | null;
    size_width: number;
    size_height: number;
    size_unit: string;
    updated_at: string;
  }>;

  const result: DocumentInfo[] = [];

  for (const doc of docs) {
    const pages = db
      .prepare('SELECT id, name, description FROM pages WHERE document_id = ? ORDER BY position')
      .all(doc.id) as PageInfo[];

    result.push({
      id: doc.id,
      title: doc.title,
      size: {
        width: doc.size_width,
        height: doc.size_height,
        unit: doc.size_unit as 'mm' | 'px',
      },
      pages,
      folder: doc.folder ?? undefined,
      updatedAt: doc.updated_at,
    });
  }

  return result;
}

export async function renameDocument(
  workspace: string,
  docId: string,
  newTitle: string,
): Promise<void> {
  const db = getWorkspaceDb(workspace);
  const result = db
    .prepare("UPDATE documents SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .run(newTitle, docId);
  if (result.changes === 0) {
    throw new Error(`Document "${docId}" not found in workspace "${workspace}"`);
  }
}

export async function duplicateDocument(workspace: string, docId: string): Promise<string> {
  const db = getWorkspaceDb(workspace);

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId) as
    | {
        id: string;
        title: string;
        folder: string | null;
        size_preset: string | null;
        size_width: number;
        size_height: number;
        size_unit: string;
        position: number;
      }
    | undefined;

  if (!doc) {
    throw new Error(`Document "${docId}" not found in workspace "${workspace}"`);
  }

  const pages = db
    .prepare(
      'SELECT id, name, description, source, position FROM pages WHERE document_id = ? ORDER BY position',
    )
    .all(docId) as Array<{
    id: string;
    name: string;
    description: string;
    source: string;
    position: number;
  }>;

  const newDocId = generateId();

  const maxPos = db.prepare('SELECT MAX(position) as maxPos FROM documents').get() as {
    maxPos: number | null;
  };
  const newPosition = (maxPos.maxPos ?? 0) + 1;

  db.prepare(
    `INSERT INTO documents (id, title, folder, size_preset, size_width, size_height, size_unit, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newDocId,
    `${doc.title} (copy)`,
    doc.folder,
    doc.size_preset,
    doc.size_width,
    doc.size_height,
    doc.size_unit,
    newPosition,
  );

  for (const page of pages) {
    const newPageId = generateId();
    db.prepare(
      `INSERT INTO pages (id, document_id, name, description, source, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(newPageId, newDocId, page.name, page.description, page.source, page.position);
  }

  return newDocId;
}

// ---------------------------------------------------------------------------
// Page operations
// ---------------------------------------------------------------------------

export async function listPages(workspace: string, document: string): Promise<PageInfo[]> {
  const db = getWorkspaceDb(workspace);
  return db
    .prepare('SELECT id, name, description FROM pages WHERE document_id = ? ORDER BY position')
    .all(document) as PageInfo[];
}

export async function readPageSource(
  workspace: string,
  document: string,
  page: string,
): Promise<string> {
  const db = getWorkspaceDb(workspace);
  const row = db
    .prepare('SELECT source FROM pages WHERE id = ? AND document_id = ?')
    .get(page, document) as { source: string } | undefined;

  if (!row) {
    throw new Error(`Page "${page}" not found in document "${document}"`);
  }

  return row.source;
}

export async function writePageSource(
  workspace: string,
  document: string,
  page: string,
  source: string,
): Promise<void> {
  const db = getWorkspaceDb(workspace);
  const result = db
    .prepare(
      "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
    )
    .run(source, page, document);

  if (result.changes === 0) {
    throw new Error(`Page "${page}" not found in document "${document}"`);
  }
}

export async function readPageDescription(
  workspace: string,
  document: string,
  page: string,
): Promise<string> {
  const db = getWorkspaceDb(workspace);
  const row = db
    .prepare('SELECT description FROM pages WHERE id = ? AND document_id = ?')
    .get(page, document) as { description: string } | undefined;

  if (!row) {
    throw new Error(`Page "${page}" not found in document "${document}"`);
  }

  return row.description;
}

export async function updatePageDescription(
  workspace: string,
  document: string,
  page: string,
  description: string,
): Promise<void> {
  const db = getWorkspaceDb(workspace);
  const result = db
    .prepare(
      "UPDATE pages SET description = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
    )
    .run(description, page, document);

  if (result.changes === 0) {
    throw new Error(`Page "${page}" not found in document "${document}"`);
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export async function readStyles(workspace: string): Promise<string> {
  const db = getWorkspaceDb(workspace);
  const row = db.prepare('SELECT css FROM styles WHERE id = 1').get() as
    | { css: string }
    | undefined;

  if (!row) {
    throw new Error(`Styles not found in workspace "${workspace}"`);
  }

  return row.css;
}

// ---------------------------------------------------------------------------
// Design System
// ---------------------------------------------------------------------------

export async function readDesignSystem(workspace: string): Promise<DesignSystem> {
  const css = await readStyles(workspace);
  const parsed = parseThemeBlock(css);
  return categorizeTokens(parsed.rawTokens, parsed.fonts);
}

export async function updateDesignTokens(
  workspace: string,
  updates: Array<{ variable: string; value: string }>,
): Promise<void> {
  const db = getWorkspaceDb(workspace);
  const row = db.prepare('SELECT css FROM styles WHERE id = 1').get() as
    | { css: string }
    | undefined;

  if (!row) {
    throw new Error(`Styles not found in workspace "${workspace}"`);
  }

  const parsed = parseThemeBlock(row.css);
  const updatedTokens = applyUpdates(parsed.rawTokens, updates);
  const newCss = serializeFullCss(parsed, updatedTokens);

  db.prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1").run(newCss);
}

// ---------------------------------------------------------------------------
// Asset file reading (unchanged — assets stay on filesystem)
// ---------------------------------------------------------------------------

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.txt': 'text/plain',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export async function readAssetFile(
  workspace: string,
  assetPath: string,
): Promise<{ data: Buffer; mimeType: string }> {
  const fullPath = join(resolveWorkspacePath(workspace), 'assets', assetPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Asset not found: ${assetPath}`);
  }
  const data = readFileSync(fullPath);
  const ext = extname(fullPath).toLowerCase();
  const mimeType = MIME_MAP[ext] ?? 'application/octet-stream';
  return { data: Buffer.from(data), mimeType };
}
