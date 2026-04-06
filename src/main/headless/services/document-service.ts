import { assertValidPageSize } from '../../../shared/document-validation';
import { PAGE_SIZES, type PageSize, type PageSizeName } from '../../../shared/types';
import { createDocument, listDocumentsFull } from '../../workspace-data';
import { getWorkspaceDb } from '../../workspace-data/db';
import { assertWorkspaceNameSafe } from '../../workspace-paths';

export interface CreateDocumentParams {
  workspaceId: string;
  title: string;
  size: PageSizeName | PageSize;
  folder?: string;
}

export async function handleDocumentCreate(
  params: CreateDocumentParams,
): Promise<{ documentId: string }> {
  assertWorkspaceNameSafe(params.workspaceId);
  const docId = await createDocument(params.workspaceId, params.title, params.size, params.folder);
  return { documentId: docId };
}

export interface UpdateDocumentSizeParams {
  workspaceId: string;
  documentId: string;
  size: PageSizeName | PageSize;
}

export async function handleDocumentUpdateSize(
  params: UpdateDocumentSizeParams,
): Promise<Record<string, never>> {
  assertWorkspaceNameSafe(params.workspaceId);
  const db = getWorkspaceDb(params.workspaceId);

  const doc = db.prepare('SELECT title FROM documents WHERE id = ?').get(params.documentId) as
    | { title: string }
    | undefined;
  if (!doc) throw new Error(`Document "${params.documentId}" not found`);

  const pageCount = db
    .prepare('SELECT COUNT(*) as count FROM pages WHERE document_id = ?')
    .get(params.documentId) as { count: number };
  if (pageCount.count > 0) {
    throw new Error(
      `Cannot change size — "${doc.title}" already has ${pageCount.count} pages. ` +
        'Size can only be changed before pages are added.',
    );
  }

  let resolvedSize: PageSize;
  let preset: string | null = null;
  if (typeof params.size === 'string') {
    const dims = PAGE_SIZES[params.size];
    if (!dims) {
      throw Object.assign(new Error(`Unknown page size preset "${params.size}"`), {
        code: -32602, // JSON-RPC Invalid params
      });
    }
    resolvedSize = dims;
    preset = params.size;
  } else {
    resolvedSize = assertValidPageSize(params.size);
  }

  db.prepare(
    "UPDATE documents SET size_preset = ?, size_width = ?, size_height = ?, size_unit = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(preset, resolvedSize.width, resolvedSize.height, resolvedSize.unit, params.documentId);

  return {};
}

export async function handleDocumentList(params: {
  workspaceId: string;
}): Promise<{ documents: unknown[] }> {
  assertWorkspaceNameSafe(params.workspaceId);
  const documents = await listDocumentsFull(params.workspaceId);
  return { documents };
}
