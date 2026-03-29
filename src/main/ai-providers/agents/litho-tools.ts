import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import { basename, join } from 'node:path';
import { tool } from 'ai';
import { z } from 'zod';
import { assertValidFolderName } from '../../../shared/document-validation';
import { type AgentId, PAGE_SIZE_NAMES, PAGE_SIZES } from '../../../shared/types';
import {
  createAssetDirectory,
  deleteAsset as deleteAssetFile,
  deleteDocumentAsset,
  listAssets,
  renameAsset as renameAssetFile,
  renameDocumentAsset,
  uploadAssets,
  uploadDocumentAssets,
} from '../../assets-manager';
import { DocumentExporter } from '../../exporter/document-exporter';
import { exportPage as exportPageFn } from '../../exporter/export-page';
import { mutationEmitter } from '../../mutation-emitter';
import { analyzePage, formatAnalysisSummary } from '../../renderer/analyze-page';
import { buildPage } from '../../renderer/index';
import { generateId, getWorkspaceDb } from '../../workspace-data/db';
import {
  createDocument as createDocumentFn,
  duplicateDocument as duplicateDocumentFn,
  readDocumentConfig,
} from '../../workspace-data/db-backend';
import { validateThemeHexColors } from '../../workspace-data/design-system-parser';
import { resolveWorkspacePath } from '../../workspace-paths';
import { replace } from '../lib/replace';

// ---------------------------------------------------------------------------
// Config — easy to fine-tune
// ---------------------------------------------------------------------------

const GREP_PAGES_CONFIG = {
  maxMatches: 20,
  contextLines: 1,
  maxLineLength: 200,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function numberLines(content: string): string {
  return content
    .split('\n')
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
}

const FORBIDDEN_OVERFLOW_RE = /\boverflow-(auto|scroll|x-auto|x-scroll|y-auto|y-scroll)\b/;

/** Reject page source that contains scrollable overflow classes. */
function detectForbiddenOverflow(source: string): string | null {
  const match = source.match(FORBIDDEN_OVERFLOW_RE);
  if (!match) return null;
  return `Page not saved — "${match[0]}" is forbidden. Pages are fixed-size print layouts and must not scroll.`;
}

/**
 * Detect asset src paths that don't use the @assets/ prefix.
 * Common mistakes: "/assets/...", "./assets/...", "/workspace-assets/...", bare filenames in src.
 */
const BAD_ASSET_SRC_RE =
  /\bsrc=["'](?:\/assets\/|\.\/assets\/|\/workspace-assets\/|\/images\/|\.\/images\/)(.*?)["']/;

function detectBadAssetPath(source: string): string | null {
  const match = source.match(BAD_ASSET_SRC_RE);
  if (!match) return null;
  const badPath = match[0];
  const filename = match[1];
  return (
    `Page not saved — ${badPath} uses a wrong asset path. ` +
    `Use @assets/${filename} for workspace assets or @assets/documents/<docId>/${filename} for document assets. ` +
    `The @assets/ prefix is required — it maps to the workspace asset directory at build time.`
  );
}

/**
 * Extract image references from page source for validation.
 * Catches `<img src="...">`, `<source src="...">`, CSS `url(...)`,
 * and JSX `backgroundImage: 'url(...)'` patterns.
 */
function extractImageRefs(source: string): { assetRefs: string[]; externalUrls: string[] } {
  const assetRefs = new Set<string>();
  const externalUrls = new Set<string>();

  // src="..." attributes (img, source, video, etc.)
  const srcRe = /\bsrc=["']([^"']+)["']/g;
  // CSS url(...) — with or without quotes
  const urlRe = /\burl\(["']?([^"')]+)["']?\)/g;

  for (const re of [srcRe, urlRe]) {
    for (const match of source.matchAll(re)) {
      const ref = match[1].trim();
      if (ref.startsWith('@assets/')) {
        assetRefs.add(ref);
      } else if (ref.startsWith('https://') || ref.startsWith('http://')) {
        externalUrls.add(ref);
      }
    }
  }

  return { assetRefs: [...assetRefs], externalUrls: [...externalUrls] };
}

/**
 * Validate that all image references in page source resolve.
 * - `@assets/` refs must point to existing files on disk.
 * - External URLs must be well-formed.
 * Returns an error string if validation fails, null otherwise.
 */
function validateImageRefs(source: string, workspacePath: string): string | null {
  const { assetRefs, externalUrls } = extractImageRefs(source);

  const missingAssets: string[] = [];
  for (const ref of assetRefs) {
    const relativePath = ref.slice('@assets/'.length);
    const absPath = join(workspacePath, 'assets', relativePath);
    if (!existsSync(absPath)) {
      missingAssets.push(ref);
    }
  }

  if (missingAssets.length > 0) {
    return (
      `Page not saved — referenced assets not found:\n` +
      missingAssets.map((r) => `  - ${r}`).join('\n') +
      `\n\nUpload the missing assets first, or fix the references. ` +
      `Use listWorkspaceAssets or listDocumentAssets to see available files.`
    );
  }

  const malformedUrls: string[] = [];
  for (const url of externalUrls) {
    try {
      new URL(url);
    } catch {
      malformedUrls.push(url);
    }
  }

  if (malformedUrls.length > 0) {
    return (
      `Page not saved — malformed external URLs:\n` +
      malformedUrls.map((u) => `  - ${u}`).join('\n') +
      `\n\nFix the URLs to be valid absolute URLs (e.g. https://example.com/image.png).`
    );
  }

  return null;
}

function formatAssetMetadata(entry: {
  ext: string;
  size: number;
  width?: number;
  height?: number;
}): string {
  const dimensions =
    entry.width && entry.height ? `${entry.width}x${entry.height}` : 'unknown-dimensions';

  return `${entry.ext}\t${entry.size}\t${dimensions}`;
}

function parseAssetPath(assetPath: string): string {
  const PREFIX = '@assets/';
  if (!assetPath.startsWith(PREFIX)) {
    throw new Error(`Asset path must start with "@assets/", got: "${assetPath}"`);
  }
  return assetPath.slice(PREFIX.length);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLithoTools(workspace: string, agentId: AgentId) {
  const db = () => getWorkspaceDb(workspace);

  function getPageLabel(docId: string, pageId: string): string {
    const pages = db()
      .prepare('SELECT id, name, position FROM pages WHERE document_id = ? ORDER BY position')
      .all(docId) as Array<{ id: string; name: string; position: number }>;
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return pageId;
    return `page ${idx + 1} "${pages[idx].name}"`;
  }

  async function runLayoutAnalysis(docId: string, pageId: string): Promise<string> {
    try {
      const buildResult = await buildPage(workspace, docId, pageId);
      if (!buildResult.ok) {
        if (buildResult.error.stage === 'tailwind') return '';
        return `\n\n[BUILD ERROR] ${buildResult.error.message}\n\nFix this error in the page source.`;
      }

      const config = await readDocumentConfig(workspace, docId);
      const analysis = await analyzePage(
        buildResult.data.html,
        buildResult.data.approach,
        config.size,
      );
      if (!analysis) return '';

      return `\n${formatAnalysisSummary(analysis)}`;
    } catch {
      return '';
    }
  }

  return {
    // ── listPages ──────────────────────────────────────────────────────
    listPages: tool({
      description: 'List all pages in a document with their IDs, names, and descriptions.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
      }),
      execute: async ({ docId }) => {
        const rows = db()
          .prepare(
            'SELECT id, name, description FROM pages WHERE document_id = ? ORDER BY position',
          )
          .all(docId) as Array<{ id: string; name: string; description: string }>;

        if (rows.length === 0) {
          return agentId === 'workspace'
            ? '(no pages yet)'
            : '(no pages yet — use createPage to add one)';
        }
        return rows.map((r, i) => `${i + 1}\t${r.id}\t${r.name}\t${r.description}`).join('\n');
      },
    }),

    // ── readPage ───────────────────────────────────────────────────────
    readPage: tool({
      description:
        'Read the source of a document page. Returns the page content with line numbers.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID'),
        // offset: z.number().optional().describe('1-indexed line number to start from (default: 1)'),
        // limit: z.number().optional().describe('Maximum number of lines to return (default: 2000)'),
      }),
      execute: async ({ docId, pageId }) => {
        const row = db()
          .prepare('SELECT source FROM pages WHERE id = ? AND document_id = ?')
          .get(pageId, docId) as { source: string } | undefined;

        if (!row) {
          throw new Error(`Page "${pageId}" not found in document "${docId}"`);
        }

        const lines = row.source.split('\n');
        const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join('\n');

        const label = getPageLabel(docId, pageId);
        const layoutSummary = await runLayoutAnalysis(docId, pageId);
        return `${label}\n\n${numbered}${layoutSummary}`;
      },
    }),

    // ── writePage ──────────────────────────────────────────────────────
    writePage: tool({
      description:
        'Write or replace the full content of a page. Use after createPage to add content, or to completely rewrite an existing page.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID'),
        content: z.string().describe('Full TSX source for the page'),
      }),
      execute: async ({ docId, pageId, content }) => {
        const forbidden = detectForbiddenOverflow(content);
        if (forbidden) return forbidden;

        const badAsset = detectBadAssetPath(content);
        if (badAsset) return badAsset;

        const wsPath = resolveWorkspacePath(workspace);
        const badRefs = validateImageRefs(content, wsPath);
        if (badRefs) return badRefs;

        const result = db()
          .prepare(
            "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
          )
          .run(content, pageId, docId);

        if (result.changes === 0) {
          throw new Error(`Page "${pageId}" not found in document "${docId}"`);
        }

        mutationEmitter.emit('mutation', {
          type: 'page',
          action: 'write',
          workspaceName: workspace,
          docId,
          pageId,
        });

        const lineCount = content.split('\n').length;
        let msg = `Wrote ${getPageLabel(docId, pageId)} (${lineCount} lines)`;

        const doc = db().prepare('SELECT description FROM documents WHERE id = ?').get(docId) as
          | { description: string }
          | undefined;
        if (doc && !doc.description) {
          msg +=
            '\n\nNote: This document has no description yet. If the intent is clear, use updateDocumentDescription to add a short summary (5-10 words).';
        }

        msg += await runLayoutAnalysis(docId, pageId);

        return msg;
      },
    }),

    // ── editPage ───────────────────────────────────────────────────────
    editPage: tool({
      description:
        'Edit a document page by replacing a specific string. ' +
        'Uses fuzzy matching to handle minor whitespace and indentation differences.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID'),
        oldString: z.string().describe('The text to replace'),
        newString: z.string().describe('The replacement text (must differ from oldString)'),
        replaceAll: z.boolean().optional().describe('Replace all occurrences (default: false)'),
      }),
      execute: async ({ docId, pageId, oldString, newString, replaceAll: replaceAllFlag }) => {
        const row = db()
          .prepare('SELECT source FROM pages WHERE id = ? AND document_id = ?')
          .get(pageId, docId) as { source: string } | undefined;

        if (!row) {
          throw new Error(`Page "${pageId}" not found in document "${docId}"`);
        }

        const updated = replace(row.source, oldString, newString, replaceAllFlag);

        const forbidden = detectForbiddenOverflow(updated);
        if (forbidden) return forbidden;

        const badAsset = detectBadAssetPath(updated);
        if (badAsset) return badAsset;

        const wsPath = resolveWorkspacePath(workspace);
        const badRefs = validateImageRefs(updated, wsPath);
        if (badRefs) return badRefs;

        db()
          .prepare(
            "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
          )
          .run(updated, pageId, docId);

        mutationEmitter.emit('mutation', {
          type: 'page',
          action: 'edit',
          workspaceName: workspace,
          docId,
          pageId,
        });

        const layoutSummary = await runLayoutAnalysis(docId, pageId);
        return `Edited ${getPageLabel(docId, pageId)}${layoutSummary}`;
      },
    }),

    // ── createPage ─────────────────────────────────────────────────────
    createPage: tool({
      description:
        'Create a new page in a document. Requires a name (1-2 words) and a short description (5-8 words). Returns the new page ID.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        name: z
          .string()
          .describe(
            'Short page name (1-2 words, max 30 chars). Examples: "Cover", "Pricing", "Team Bio"',
          ),
        description: z
          .string()
          .optional()
          .describe('Short description of the page content (5-8 words)'),
        afterPageId: z
          .string()
          .optional()
          .describe('Insert after this page ID. Appends to end if omitted.'),
      }),
      execute: async ({ docId, name, description, afterPageId }) => {
        const trimmedName = name.trim();
        if (trimmedName.length === 0 || trimmedName.length > 30) {
          throw new Error(
            `Page name must be 1-30 characters, got ${trimmedName.length}. Provide a short name like "Cover" or "Pricing".`,
          );
        }
        const wordCount = trimmedName.split(/\s+/).length;
        if (wordCount > 3) {
          throw new Error(
            `Page name must be 1-3 words, got ${wordCount}. Use a short label like "Cover" or "Team Bio".`,
          );
        }

        const d = db();
        const pages = d
          .prepare('SELECT id, position FROM pages WHERE document_id = ? ORDER BY position')
          .all(docId) as Array<{ id: string; position: number }>;

        if (pages.length === 0) {
          const doc = d.prepare('SELECT id FROM documents WHERE id = ?').get(docId);
          if (!doc) {
            throw new Error(`Document "${docId}" not found`);
          }
        }

        let position: number;

        if (afterPageId) {
          const afterIdx = pages.findIndex((p) => p.id === afterPageId);
          if (afterIdx === -1) throw new Error(`Page "${afterPageId}" not found`);

          const afterPos = pages[afterIdx].position;
          const nextPos = afterIdx + 1 < pages.length ? pages[afterIdx + 1].position : afterPos + 2;
          position = (afterPos + nextPos) / 2;
        } else {
          const maxPos = pages.length > 0 ? pages[pages.length - 1].position : 0;
          position = maxPos + 1;
        }

        const newPageId = generateId();
        const desc = description ?? 'Blank page';
        const pageContent = `import '@styles.css'\n\nexport default function Page() {\n  return (\n    <div className="w-full h-full bg-white p-12 flex flex-col">\n    </div>\n  )\n}\n`;

        d.prepare(
          'INSERT INTO pages (id, document_id, name, description, source, position) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(newPageId, docId, trimmedName, desc, pageContent, position);

        mutationEmitter.emit('mutation', {
          type: 'page',
          action: 'create',
          workspaceName: workspace,
          docId,
        });

        const pageNumber = pages.filter((p) => p.position < position).length + 1;
        return `Created page ${pageNumber} "${trimmedName}" (${newPageId}, blank). Use writePage to add content.`;
      },
    }),

    // ── deletePage ─────────────────────────────────────────────────────
    deletePage: tool({
      description: 'Delete a page from a document.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID to delete'),
      }),
      execute: async ({ docId, pageId }) => {
        const result = db()
          .prepare('DELETE FROM pages WHERE id = ? AND document_id = ?')
          .run(pageId, docId);

        if (result.changes === 0) throw new Error(`Page "${pageId}" not found`);

        mutationEmitter.emit('mutation', {
          type: 'page',
          action: 'delete',
          workspaceName: workspace,
          docId,
        });

        return `Deleted ${pageId}`;
      },
    }),

    // ── updatePageDetails ──────────────────────────────────────────────
    updatePageDetails: tool({
      description:
        "Update a page's name and/or description. Only use when writePage fundamentally changes what a page is about (e.g. a pricing table becomes a team page).",
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID'),
        name: z.string().optional().describe('New page name (1-2 words like "Cover", "Pricing")'),
        description: z.string().optional().describe('New short description (5-8 words)'),
      }),
      execute: async ({ docId, pageId, name, description }) => {
        if (!name && !description) {
          throw new Error('At least one of name or description must be provided');
        }

        const setClauses: string[] = ["updated_at = datetime('now')"];
        const values: string[] = [];

        if (name !== undefined) {
          setClauses.push('name = ?');
          values.push(name);
        }
        if (description !== undefined) {
          setClauses.push('description = ?');
          values.push(description);
        }

        values.push(pageId, docId);

        const result = db()
          .prepare(`UPDATE pages SET ${setClauses.join(', ')} WHERE id = ? AND document_id = ?`)
          .run(...values) as { changes: number };

        if (result.changes === 0) {
          throw new Error(`Page "${pageId}" not found in document "${docId}"`);
        }

        mutationEmitter.emit('mutation', {
          type: 'page',
          action: 'updateDetails',
          workspaceName: workspace,
          docId,
        });

        const updated = [name && 'name', description && 'description']
          .filter(Boolean)
          .join(' and ');
        return `Updated ${updated} for ${pageId}`;
      },
    }),

    // ── movePage ───────────────────────────────────────────────────────
    movePage: tool({
      description: 'Move a page to a new position in the document.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID to move'),
        targetPageId: z.string().describe('Target page ID to move relative to'),
        position: z.enum(['before', 'after']).describe('Move before or after target'),
      }),
      execute: async ({ docId, pageId, targetPageId, position }) => {
        const d = db();
        const pages = d
          .prepare('SELECT id, position FROM pages WHERE document_id = ? ORDER BY position')
          .all(docId) as Array<{ id: string; position: number }>;

        if (pages.length < 2) {
          throw new Error('Document must have at least 2 pages to reorder');
        }

        const movingIdx = pages.findIndex((p) => p.id === pageId);
        if (movingIdx === -1) {
          throw new Error(`Page "${pageId}" not found in document "${docId}"`);
        }

        const targetIdx = pages.findIndex((p) => p.id === targetPageId);
        if (targetIdx === -1) {
          throw new Error(`Target page "${targetPageId}" not found in document "${docId}"`);
        }

        if (pageId === targetPageId) {
          throw new Error('Cannot move a page relative to itself');
        }

        let newPosition: number;

        if (position === 'before') {
          if (targetIdx === 0) {
            newPosition = pages[0].position / 2;
          } else {
            newPosition = (pages[targetIdx - 1].position + pages[targetIdx].position) / 2;
          }
        } else {
          if (targetIdx === pages.length - 1) {
            newPosition = pages[targetIdx].position + 1;
          } else {
            newPosition = (pages[targetIdx].position + pages[targetIdx + 1].position) / 2;
          }
        }

        const currentIdx = pages.findIndex(
          (p, i) =>
            (i === 0 || pages[i - 1].position < newPosition) &&
            (i === pages.length - 1 || pages[i + 1].position > newPosition) &&
            p.id === pageId,
        );

        if (currentIdx !== -1) {
          return `Page ${pageId} is already in that position`;
        }

        d.prepare(
          "UPDATE pages SET position = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
        ).run(newPosition, pageId, docId);

        mutationEmitter.emit('mutation', {
          type: 'page',
          action: 'move',
          workspaceName: workspace,
          docId,
        });

        return `Moved ${pageId} ${position} ${targetPageId}`;
      },
    }),

    // ── updateDocumentDescription ──────────────────────────────────────
    updateDocumentDescription: tool({
      description:
        "Set or update a document's description. Use after writing pages when the document's intent is clear.",
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        description: z
          .string()
          .describe(
            'Short description of the document (5-10 words, e.g. "Client proposal for Q4 marketing campaign")',
          ),
      }),
      execute: async ({ docId, description }) => {
        const result = db()
          .prepare(
            "UPDATE documents SET description = ?, updated_at = datetime('now') WHERE id = ?",
          )
          .run(description, docId);

        if (result.changes === 0) {
          throw new Error(`Document "${docId}" not found`);
        }

        mutationEmitter.emit('mutation', {
          type: 'document',
          action: 'updateDescription',
          workspaceName: workspace,
          docId,
        });

        return 'Updated document description.';
      },
    }),

    // ── listDocuments ─────────────────────────────────────────────────
    listDocuments: tool({
      description:
        'List all documents in the workspace as a tree grouped by folder. Returns document IDs, titles, descriptions, page sizes, and page counts.',
      inputSchema: z.object({}),
      execute: async () => {
        const rows = db()
          .prepare(
            `SELECT d.id, d.title, d.description, d.folder,
                    d.size_preset, d.size_width, d.size_height, d.size_unit,
                    (SELECT COUNT(*) FROM pages p WHERE p.document_id = d.id) AS page_count
             FROM documents d WHERE d.type = 'normal' ORDER BY d.folder, d.created_at`,
          )
          .all() as Array<{
          id: string;
          title: string;
          description: string;
          folder: string | null;
          size_preset: string | null;
          size_width: number;
          size_height: number;
          size_unit: string;
          page_count: number;
        }>;

        if (rows.length === 0) {
          return '(no documents yet)';
        }

        const formatSize = (r: (typeof rows)[0]) =>
          r.size_preset ?? `${r.size_width}×${r.size_height} ${r.size_unit}`;

        const grouped = new Map<string, typeof rows>();
        for (const row of rows) {
          const key = row.folder ?? '';
          const list = grouped.get(key) ?? [];
          list.push(row);
          grouped.set(key, list);
        }

        const lines: string[] = [];
        for (const [folder, docs] of grouped) {
          if (folder) {
            lines.push(`${folder}/`);
          } else {
            lines.push('(ungrouped)');
          }
          for (const d of docs) {
            const desc = d.description ? ` — ${d.description}` : '';
            const pages = d.page_count === 1 ? '1 page' : `${d.page_count} pages`;
            lines.push(`  ${d.title}${desc}\t(${d.id}, ${formatSize(d)}, ${pages})`);
          }
        }

        return lines.join('\n');
      },
    }),

    // ── grepPages ───────────────────────────────────────────────────────
    grepPages: tool({
      description:
        'Search page source code across all documents using full-text search. ' +
        'Supports FTS5 syntax: AND, OR, NOT, "exact phrase", prefix*, NEAR(a b, N).',
      inputSchema: z.object({
        query: z.string().describe('FTS5 search query'),
        docId: z.string().optional().describe('Scope search to a single document'),
      }),
      execute: async ({ query: rawQuery, docId }) => {
        // Auto-quote hyphenated terms (e.g. "bg-gradient-bold") that aren't already
        // quoted, so FTS5 doesn't interpret hyphens as the NOT operator.
        const FTS5_OPERATORS = /\b(AND|OR|NOT|NEAR)\b/;
        const query =
          rawQuery.includes('-') && !rawQuery.includes('"') && !FTS5_OPERATORS.test(rawQuery)
            ? `"${rawQuery}"`
            : rawQuery;

        const d = db();

        const sql = docId
          ? `SELECT p.id AS pageId, p.document_id AS docId, p.name AS pageName, p.source,
                    d.title AS docTitle
             FROM pages_fts fts
             JOIN pages p ON p.rowid = fts.rowid
             JOIN documents d ON d.id = p.document_id
             WHERE pages_fts MATCH ? AND p.document_id = ?
             LIMIT ?`
          : `SELECT p.id AS pageId, p.document_id AS docId, p.name AS pageName, p.source,
                    d.title AS docTitle
             FROM pages_fts fts
             JOIN pages p ON p.rowid = fts.rowid
             JOIN documents d ON d.id = p.document_id
             WHERE pages_fts MATCH ?
             LIMIT ?`;

        const params = docId
          ? [query, docId, GREP_PAGES_CONFIG.maxMatches]
          : [query, GREP_PAGES_CONFIG.maxMatches];

        const rows = d.prepare(sql).all(...params) as Array<{
          pageId: string;
          docId: string;
          pageName: string;
          source: string;
          docTitle: string;
        }>;

        if (rows.length === 0) {
          return '(no matches)';
        }

        // Extract query terms for line matching (strip FTS operators)
        const terms = query
          .replace(/\b(AND|OR|NOT|NEAR)\b/g, '')
          .replace(/['"()*]/g, '')
          .split(/\s+/)
          .filter((t) => t.length > 0)
          .map((t) => t.toLowerCase());

        const output: string[] = [];

        for (const row of rows) {
          const lines = row.source.split('\n');
          const matchingLineIndices = new Set<number>();

          for (let i = 0; i < lines.length; i++) {
            const lower = lines[i].toLowerCase();
            if (terms.some((t) => lower.includes(t))) {
              matchingLineIndices.add(i);
            }
          }

          if (matchingLineIndices.size === 0) continue;

          // Expand with context lines
          const displayLines = new Set<number>();
          for (const idx of matchingLineIndices) {
            for (
              let c = idx - GREP_PAGES_CONFIG.contextLines;
              c <= idx + GREP_PAGES_CONFIG.contextLines;
              c++
            ) {
              if (c >= 0 && c < lines.length) displayLines.add(c);
            }
          }

          const sorted = [...displayLines].sort((a, b) => a - b);
          const header = `${row.docTitle} / ${row.pageName} (${row.docId}/${row.pageId})`;
          output.push(header);

          let lastLine = -2;
          for (const idx of sorted) {
            if (idx > lastLine + 1 && lastLine !== -2) {
              output.push('  ...');
            }
            const line = lines[idx];
            const truncated =
              line.length > GREP_PAGES_CONFIG.maxLineLength
                ? `${line.slice(0, GREP_PAGES_CONFIG.maxLineLength)}…`
                : line;
            output.push(`  ${idx + 1}: ${truncated}`);
            lastLine = idx;
          }
          output.push('');
        }

        return output.join('\n').trimEnd();
      },
    }),

    // ── readMainCss ────────────────────────────────────────────────────
    readMainCss: tool({
      description:
        'Read the workspace styles.css file. Returns the design system CSS with line numbers.',
      inputSchema: z.object({}),
      execute: async () => {
        const row = db().prepare('SELECT css, original_css_hash FROM styles WHERE id = 1').get() as
          | { css: string; original_css_hash: string | null }
          | undefined;

        if (!row) {
          throw new Error('Styles not found');
        }

        let result = numberLines(row.css);

        if (agentId === 'design-system' && row.original_css_hash) {
          const currentHash = createHash('sha256').update(row.css).digest('hex');
          if (currentHash === row.original_css_hash) {
            result +=
              '\n\n[NOTE: This is the original starter template — it has not been customized yet. Guide the user to personalize it for their brand.]';
          }
        }

        return result;
      },
    }),

    // ── writeMainCss ───────────────────────────────────────────────────
    writeMainCss: tool({
      description:
        'Replace the entire workspace styles.css file. Use for full design system rewrites.',
      inputSchema: z.object({
        content: z.string().describe('Full CSS source for styles.css'),
      }),
      execute: async ({ content }) => {
        validateThemeHexColors(content);
        db()
          .prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1")
          .run(content);

        mutationEmitter.emit('mutation', {
          type: 'css',
          action: 'write',
          workspaceName: workspace,
        });

        const lineCount = content.split('\n').length;
        return `Wrote styles.css (${lineCount} lines)`;
      },
    }),

    // ── editMainCss ────────────────────────────────────────────────────
    editMainCss: tool({
      description:
        'Edit the workspace styles.css by replacing a specific string. ' +
        'Uses fuzzy matching to handle minor whitespace and indentation differences.',
      inputSchema: z.object({
        oldString: z.string().describe('The text to replace'),
        newString: z.string().describe('The replacement text (must differ from oldString)'),
        replaceAll: z.boolean().optional().describe('Replace all occurrences (default: false)'),
      }),
      execute: async ({ oldString, newString, replaceAll: replaceAllFlag }) => {
        const row = db().prepare('SELECT css FROM styles WHERE id = 1').get() as
          | { css: string }
          | undefined;

        if (!row) {
          throw new Error('Styles not found');
        }

        const updated = replace(row.css, oldString, newString, replaceAllFlag);
        validateThemeHexColors(updated);

        db()
          .prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1")
          .run(updated);

        mutationEmitter.emit('mutation', { type: 'css', action: 'edit', workspaceName: workspace });

        return 'Edited styles.css';
      },
    }),

    // ── listWorkspaceAssets ───────────────────────────────────────────
    listWorkspaceAssets: tool({
      description:
        'List workspace-level assets (images) shared across all documents. ' +
        'Includes nested asset directories but excludes per-document asset folders. ' +
        'Reference these in pages as @assets/path/to/file (the paths returned already include the @assets/ prefix).',
      inputSchema: z.object({}),
      execute: async () => {
        const workspacePath = resolveWorkspacePath(workspace);
        const allEntries = listAssets(workspacePath, '', true);

        const filtered = [...allEntries]
          .filter((e) => e.type === 'file')
          .filter((e) => e.path !== 'documents' && !e.path.startsWith('documents/'))
          .sort((a, b) => a.path.localeCompare(b.path));

        if (filtered.length === 0) return '(no workspace assets)';
        return filtered
          .map((entry) => `@assets/${entry.path}\t${formatAssetMetadata(entry)}`)
          .join('\n');
      },
    }),

    // ── listDocumentAssets ────────────────────────────────────────────
    listDocumentAssets: tool({
      description:
        'List assets belonging to a specific document. ' +
        'Reference these in pages as @assets/documents/<docId>/filename.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
      }),
      execute: async ({ docId }) => {
        const workspacePath = resolveWorkspacePath(workspace);
        const entries = [...listAssets(workspacePath, `documents/${docId}`, false)]
          .filter((e) => e.type === 'file')
          .sort((a, b) => a.name.localeCompare(b.name));

        if (entries.length === 0) return '(no document assets)';
        return entries
          .map((entry) => `@assets/documents/${docId}/${entry.name}\t${formatAssetMetadata(entry)}`)
          .join('\n');
      },
    }),

    // ── viewAsset ─────────────────────────────────────────────────────────
    viewAsset: tool({
      description:
        'Return a workspace or document asset as an inline image so you can see it. ' +
        'Use the @assets/ path as shown by listWorkspaceAssets or listDocumentAssets.',
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'Asset path starting with @assets/ (e.g. @assets/logo.png, @assets/documents/<docId>/photo.jpg)',
          ),
      }),
      execute: async ({ path: assetPath }) => {
        const workspacePath = resolveWorkspacePath(workspace);
        const relPath = parseAssetPath(assetPath);
        const abs = join(workspacePath, 'assets', relPath);
        if (!existsSync(abs)) {
          throw new Error(`Asset not found: ${assetPath}`);
        }
        const ext = assetPath.split('.').pop()?.toLowerCase() ?? '';
        const MIME_MAP: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          webp: 'image/webp',
          gif: 'image/gif',
          svg: 'image/svg+xml',
        };
        const mediaType = MIME_MAP[ext];
        if (!mediaType) {
          throw new Error(`Unsupported image type: .${ext}`);
        }
        const buffer = readFileSync(abs);
        console.log(`[viewAsset] path=${relPath} size=${buffer.length}B`);
        return {
          type: 'content' as const,
          value: [{ type: 'media' as const, data: buffer.toString('base64'), mediaType }],
        };
      },
      toModelOutput: (output) => output,
    }),

    // ── updateDocumentSize ──────────────────────────────────────────────
    updateDocumentSize: tool({
      description: "Change a document's page size. Only works if the document has no pages yet.",
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        size: z.enum(PAGE_SIZE_NAMES).describe('New page size preset'),
      }),
      execute: async ({ docId, size }) => {
        const d = db();
        const doc = d.prepare('SELECT title FROM documents WHERE id = ?').get(docId) as
          | { title: string }
          | undefined;

        if (!doc) throw new Error(`Document "${docId}" not found`);

        const pageCount = d
          .prepare('SELECT COUNT(*) as count FROM pages WHERE document_id = ?')
          .get(docId) as { count: number };

        if (pageCount.count > 0) {
          throw new Error(
            `Cannot change size — "${doc.title}" already has ${pageCount.count} pages. Size can only be changed before pages are added.`,
          );
        }

        const dimensions = PAGE_SIZES[size];
        d.prepare(
          "UPDATE documents SET size_preset = ?, size_width = ?, size_height = ?, size_unit = ?, updated_at = datetime('now') WHERE id = ?",
        ).run(size, dimensions.width, dimensions.height, dimensions.unit, docId);

        mutationEmitter.emit('mutation', {
          type: 'document',
          action: 'updateSize',
          workspaceName: workspace,
          docId,
        });

        return `Changed "${doc.title}" to ${size} (${dimensions.width}×${dimensions.height} ${dimensions.unit}).`;
      },
    }),

    // ── createDocument ──────────────────────────────────────────────────
    createDocument: tool({
      description: 'Create a new document in the workspace. Returns the new document ID.',
      inputSchema: z.object({
        title: z.string().describe('Document title (e.g. "Q4 Proposal", "Team Directory")'),
        size: z
          .enum(PAGE_SIZE_NAMES)
          .describe('Page size preset — ask the user if not obvious from context'),
        folder: z
          .string()
          .optional()
          .describe(
            'Folder to organize the document into (e.g. "Client Proposals", "Social Media")',
          ),
      }),
      execute: async ({ title, size, folder }) => {
        const docId = await createDocumentFn(workspace, title, size, folder);
        mutationEmitter.emit('mutation', {
          type: 'document',
          action: 'create',
          workspaceName: workspace,
          docId,
        });
        const folderNote = folder ? ` in "${folder}"` : '';
        return `Created "${title}"${folderNote} (${docId}, ${size}). The document is empty — open it to start adding pages.`;
      },
    }),

    // ── deleteDocument ──────────────────────────────────────────────────
    deleteDocument: tool({
      description:
        'Permanently delete a document and all its pages. Cannot be undone. ' +
        'Cannot delete the design system document. ' +
        'You must provide the correct page count as confirmation.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID to delete'),
        pageCount: z
          .number()
          .describe('Expected number of pages in the document (safety confirmation)'),
      }),
      execute: async ({ docId, pageCount }) => {
        const d = db();
        const doc = d.prepare('SELECT title, type FROM documents WHERE id = ?').get(docId) as
          | { title: string; type: string }
          | undefined;

        if (!doc) throw new Error(`Document "${docId}" not found`);
        if (doc.type === 'design-system') {
          throw new Error('The design system document cannot be deleted.');
        }

        const actual = d
          .prepare('SELECT COUNT(*) as count FROM pages WHERE document_id = ?')
          .get(docId) as { count: number };

        if (actual.count !== pageCount) {
          return `Delete rejected — you said the document has ${pageCount} pages but it actually has ${actual.count}. Confirm with the user the number of pages before trying again.`;
        }

        d.prepare('DELETE FROM documents WHERE id = ?').run(docId);
        mutationEmitter.emit('mutation', {
          type: 'document',
          action: 'delete',
          workspaceName: workspace,
          docId,
        });
        return `Deleted "${doc.title}" and its ${actual.count} pages.`;
      },
    }),

    // ── renameDocument ──────────────────────────────────────────────────
    renameDocument: tool({
      description: 'Rename a document.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        title: z.string().describe('New document title'),
      }),
      execute: async ({ docId, title }) => {
        const d = db();
        const doc = d.prepare('SELECT title FROM documents WHERE id = ?').get(docId) as
          | { title: string }
          | undefined;

        if (!doc) throw new Error(`Document "${docId}" not found`);

        d.prepare("UPDATE documents SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
          title,
          docId,
        );

        mutationEmitter.emit('mutation', {
          type: 'document',
          action: 'rename',
          workspaceName: workspace,
          docId,
        });

        return `Renamed "${doc.title}" → "${title}"`;
      },
    }),

    // ── moveDocumentToFolder ────────────────────────────────────────────
    moveDocumentToFolder: tool({
      description:
        'Move a document into a folder for organization. ' +
        'Pass an empty string to remove from its current folder.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        folder: z
          .string()
          .describe('Target folder name (e.g. "Client Proposals"). Empty string to un-folder.'),
      }),
      execute: async ({ docId, folder }) => {
        const d = db();
        const doc = d.prepare('SELECT title, folder FROM documents WHERE id = ?').get(docId) as
          | { title: string; folder: string | null }
          | undefined;

        if (!doc) throw new Error(`Document "${docId}" not found`);

        const normalizedFolder = folder ? assertValidFolderName(folder) : '';

        d.prepare("UPDATE documents SET folder = ?, updated_at = datetime('now') WHERE id = ?").run(
          normalizedFolder || null,
          docId,
        );

        mutationEmitter.emit('mutation', {
          type: 'document',
          action: 'move',
          workspaceName: workspace,
          docId,
        });

        if (!normalizedFolder) {
          return `Moved "${doc.title}" out of "${doc.folder}" to ungrouped.`;
        }
        return `Moved "${doc.title}" → "${normalizedFolder}"`;
      },
    }),

    // ── duplicateDocument ───────────────────────────────────────────────
    duplicateDocument: tool({
      description: 'Duplicate a document and all its pages. The copy is named "{title} (copy)".',
      inputSchema: z.object({
        docId: z.string().describe('Document ID to duplicate'),
      }),
      execute: async ({ docId }) => {
        const d = db();
        const doc = d.prepare('SELECT title FROM documents WHERE id = ?').get(docId) as
          | { title: string }
          | undefined;

        if (!doc) throw new Error(`Document "${docId}" not found`);

        const newDocId = await duplicateDocumentFn(workspace, docId);

        mutationEmitter.emit('mutation', {
          type: 'document',
          action: 'duplicate',
          workspaceName: workspace,
          docId: newDocId,
        });

        const pageCount = d
          .prepare('SELECT COUNT(*) as count FROM pages WHERE document_id = ?')
          .get(newDocId) as { count: number };

        return `Duplicated "${doc.title}" → "${doc.title} (copy)" (${newDocId}, ${pageCount.count} pages)`;
      },
    }),

    // ── uploadAsset ──────────────────────────────────────────────────────────
    uploadAsset: tool({
      description:
        'Upload an image asset from a local file path or HTTP(S) URL into workspace or document assets.',
      inputSchema: z.object({
        source: z.string().describe('Absolute local file path or HTTP(S) URL'),
        docId: z
          .string()
          .optional()
          .describe('Document ID — uploads to per-document assets if provided'),
        name: z.string().optional().describe('Override filename (including extension)'),
        folder: z
          .string()
          .optional()
          .describe('Workspace asset sub-folder (e.g. "icons"). Ignored when docId is set.'),
      }),
      execute: async ({ source, docId, name, folder }) => {
        const workspacePath = resolveWorkspacePath(workspace);
        let data: Uint8Array;
        let resolvedName: string;

        if (source.startsWith('http://') || source.startsWith('https://')) {
          const response = await fetch(source);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} fetching: ${source}`);
          }
          data = new Uint8Array(await response.arrayBuffer());
          resolvedName = name ?? basename(new URL(source).pathname);
        } else {
          data = readFileSync(source);
          resolvedName = name ?? basename(source);
        }

        if (docId) {
          uploadDocumentAssets(workspacePath, docId, [{ name: resolvedName, data }]);
        } else {
          uploadAssets(workspacePath, folder ?? '', [{ name: resolvedName, data }]);
        }

        return `Asset uploaded: ${resolvedName}`;
      },
    }),

    // ── deleteAsset ──────────────────────────────────────────────────────────
    deleteAsset: tool({
      description:
        'Delete a workspace or document asset file or folder. ' +
        'Use the @assets/ path as shown by listWorkspaceAssets or listDocumentAssets.',
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            'Asset path starting with @assets/ (e.g. @assets/logo.png, @assets/icons/, @assets/documents/<docId>/file.jpg)',
          ),
      }),
      execute: async ({ path: assetPath }) => {
        const workspacePath = resolveWorkspacePath(workspace);
        const relPath = parseAssetPath(assetPath);

        const DOC_PREFIX = 'documents/';
        if (relPath.startsWith(DOC_PREFIX)) {
          const withoutPrefix = relPath.slice(DOC_PREFIX.length);
          const slashIdx = withoutPrefix.indexOf('/');
          if (slashIdx === -1) {
            throw new Error(
              `Invalid document asset path: "${assetPath}" — expected @assets/documents/<docId>/filename`,
            );
          }
          const docId = withoutPrefix.slice(0, slashIdx);
          const fileName = withoutPrefix.slice(slashIdx + 1);
          deleteDocumentAsset(workspacePath, docId, fileName);
        } else {
          deleteAssetFile(workspacePath, relPath);
        }

        return `Deleted: ${assetPath}`;
      },
    }),

    // ── renameAsset ──────────────────────────────────────────────────────────
    renameAsset: tool({
      description: 'Rename or move a workspace or document asset.',
      inputSchema: z.object({
        path: z.string().describe('Current asset path starting with @assets/'),
        newPath: z.string().describe('New asset path starting with @assets/'),
      }),
      execute: async ({ path: assetPath, newPath }) => {
        const workspacePath = resolveWorkspacePath(workspace);
        const oldRel = parseAssetPath(assetPath);
        const newRel = parseAssetPath(newPath);

        const DOC_PREFIX = 'documents/';
        if (oldRel.startsWith(DOC_PREFIX)) {
          const withoutPrefix = oldRel.slice(DOC_PREFIX.length);
          const slashIdx = withoutPrefix.indexOf('/');
          if (slashIdx === -1) {
            throw new Error(`Invalid document asset path: "${assetPath}"`);
          }
          const docId = withoutPrefix.slice(0, slashIdx);
          const oldName = withoutPrefix.slice(slashIdx + 1);
          const newName = newRel.startsWith(DOC_PREFIX + docId + '/')
            ? newRel.slice(DOC_PREFIX.length + docId.length + 1)
            : basename(newRel);
          renameDocumentAsset(workspacePath, docId, oldName, newName);
        } else {
          renameAssetFile(workspacePath, oldRel, newRel);
        }

        return `Renamed: ${assetPath} → ${newPath}`;
      },
    }),

    // ── createAssetFolder ────────────────────────────────────────────────────
    createAssetFolder: tool({
      description:
        'Create a new folder in the workspace assets directory. Cannot use "documents" (reserved).',
      inputSchema: z.object({
        folder: z
          .string()
          .describe('Folder name or path to create (e.g. "logos" or "brand/icons")'),
      }),
      execute: async ({ folder }) => {
        const workspacePath = resolveWorkspacePath(workspace);
        createAssetDirectory(workspacePath, folder);
        return `Folder created: ${folder}`;
      },
    }),

    // ── exportPage ───────────────────────────────────────────────────────────
    exportPage: tool({
      description:
        'Render and export a single document page as an image (PNG or JPG). ' +
        'Returns the path to the saved file. Useful for a visual feedback loop — export, read the image, iterate.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID'),
        format: z.enum(['png', 'jpg']).optional().describe('Image format (default: png)'),
        outputPath: z
          .string()
          .optional()
          .describe('Absolute file path to save to. Defaults to a temp file.'),
      }),
      execute: async ({ docId, pageId, format: fmt, outputPath }) => {
        const resolvedFormat = fmt ?? 'png';
        const config = await readDocumentConfig(workspace, docId);

        const buildResult = await buildPage(workspace, docId, pageId);
        if (!buildResult.ok) {
          throw new Error(`Build failed: ${buildResult.error.message}`);
        }

        const finalPath = outputPath ?? join(os.tmpdir(), `page-${pageId}.${resolvedFormat}`);

        await exportPageFn({
          html: buildResult.data.html,
          approach: buildResult.data.approach,
          format: resolvedFormat,
          size: config.size,
          dpi: 150,
          jpgQuality: 90,
          savePath: finalPath,
        });

        return `Image saved at ${finalPath}`;
      },
    }),

    // ── viewPage ───────────────────────────────────────────────────────
    viewPage: tool({
      description:
        'Render a document page and return it as an inline image so you can see the visual result.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID'),
      }),
      execute: async ({ docId, pageId }) => {
        const config = await readDocumentConfig(workspace, docId);
        const buildResult = await buildPage(workspace, docId, pageId);
        if (!buildResult.ok) {
          throw new Error(`Build failed: ${buildResult.error.message}`);
        }
        const buffer = await exportPageFn({
          html: buildResult.data.html,
          approach: buildResult.data.approach,
          format: 'jpg',
          size: config.size,
          dpi: 72,
          jpgQuality: 70,
          savePath: '',
        });
        const base64 = buffer.toString('base64');
        console.log(
          `[viewPage] page=${pageId} raw=${buffer.length}B base64=${base64.length}B`,
        );
        return {
          type: 'content' as const,
          value: [{ type: 'media' as const, data: base64, mediaType: 'image/jpeg' }],
        };
      },
      // Pass structured content directly to the model so images are sent as
      // actual vision input, not serialized as a JSON text blob.
      toModelOutput: (output) => output,
    }),

    // ── exportDocument ───────────────────────────────────────────────────────
    exportDocument: tool({
      description:
        'Export an entire document to PDF or as images (PNG/JPG). ' +
        'PDF is a single merged file. PNG/JPG exports each page as a separate file in a directory.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        format: z.enum(['pdf', 'png', 'jpg']).optional().describe('Export format (default: pdf)'),
        outputPath: z
          .string()
          .optional()
          .describe(
            'For PDF: absolute file path. For images: absolute directory path. Defaults to a temp location.',
          ),
      }),
      execute: async ({ docId, format: fmt, outputPath }) => {
        const resolvedFormat = fmt ?? 'pdf';
        const config = await readDocumentConfig(workspace, docId);
        const pageIds = config.pages.map((p) => p.id);

        if (resolvedFormat === 'pdf') {
          const finalPath = outputPath ?? join(os.tmpdir(), `${config.title}-${docId}.pdf`);
          const exporter = new DocumentExporter();
          await exporter.exportDocument({
            format: 'pdf',
            workspaceName: workspace,
            docId,
            title: config.title,
            pages: pageIds,
            size: config.size,
            dpi: 150,
            jpgQuality: 90,
            savePath: finalPath,
          });
          return `Document exported to ${finalPath}`;
        }

        const outDir = outputPath ?? join(os.tmpdir(), `${docId}-export`);
        await mkdir(outDir, { recursive: true });

        for (let i = 0; i < pageIds.length; i++) {
          const buildResult = await buildPage(workspace, docId, pageIds[i]);
          if (!buildResult.ok) {
            throw new Error(`Build failed for page ${i + 1}: ${buildResult.error.message}`);
          }
          await exportPageFn({
            html: buildResult.data.html,
            approach: buildResult.data.approach,
            format: resolvedFormat,
            size: config.size,
            dpi: 150,
            jpgQuality: 90,
            savePath: join(outDir, `page-${i + 1}.${resolvedFormat}`),
          });
        }

        if (pageIds.length === 1) {
          return `Image saved at ${join(outDir, `page-1.${resolvedFormat}`)}`;
        }
        return `Pages exported to ${outDir}/`;
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Type export
// ---------------------------------------------------------------------------

export type LithoToolName = keyof ReturnType<typeof createLithoTools>;
