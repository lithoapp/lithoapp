import { tool } from 'ai';
import { z } from 'zod';
import { generateId, getWorkspaceDb } from '../../workspace-data/db';
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLithoTools(workspace: string) {
  const db = () => getWorkspaceDb(workspace);

  function getPageLabel(docId: string, pageId: string): string {
    const pages = db()
      .prepare('SELECT id, name, position FROM pages WHERE document_id = ? ORDER BY position')
      .all(docId) as Array<{ id: string; name: string; position: number }>;
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1) return pageId;
    return `page ${idx + 1} "${pages[idx].name}"`;
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
          return '(no pages yet — use createPage to add one)';
        }
        return rows.map((r) => `${r.id}\t${r.name}\t${r.description}`).join('\n');
      },
    }),

    // ── readPage ───────────────────────────────────────────────────────
    readPage: tool({
      description:
        'Read the source of a document page. Returns the page content with line numbers.',
      inputSchema: z.object({
        docId: z.string().describe('Document ID'),
        pageId: z.string().describe('Page ID'),
        offset: z.number().optional().describe('1-indexed line number to start from (default: 1)'),
        limit: z.number().optional().describe('Maximum number of lines to return (default: 2000)'),
      }),
      execute: async ({ docId, pageId, offset: rawOffset, limit: rawLimit }) => {
        const row = db()
          .prepare('SELECT source FROM pages WHERE id = ? AND document_id = ?')
          .get(pageId, docId) as { source: string } | undefined;

        if (!row) {
          throw new Error(`Page "${pageId}" not found in document "${docId}"`);
        }

        const lines = row.source.split('\n');
        const offset = Math.max(1, rawOffset ?? 1);
        const limit = rawLimit ?? 2000;
        const sliced = lines.slice(offset - 1, offset - 1 + limit);

        const numbered = sliced.map((line, i) => `${offset + i}: ${line}`).join('\n');

        const total = lines.length;
        const end = offset - 1 + sliced.length;
        const suffix =
          end < total ? `\n\n(${total - end} more lines — use offset=${end + 1} to continue)` : '';

        return numbered + suffix;
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
        const result = db()
          .prepare(
            "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
          )
          .run(content, pageId, docId);

        if (result.changes === 0) {
          throw new Error(`Page "${pageId}" not found in document "${docId}"`);
        }

        const lineCount = content.split('\n').length;
        return `Wrote ${getPageLabel(docId, pageId)} (${lineCount} lines)`;
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

        db()
          .prepare(
            "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
          )
          .run(updated, pageId, docId);

        return `Edited ${getPageLabel(docId, pageId)}`;
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

        return `Moved ${pageId} ${position} ${targetPageId}`;
      },
    }),

    // ── listDocuments ─────────────────────────────────────────────────
    listDocuments: tool({
      description:
        'List all documents in the workspace as a tree grouped by folder. Returns document IDs, titles, and page sizes.',
      inputSchema: z.object({}),
      execute: async () => {
        const rows = db()
          .prepare(
            `SELECT id, title, folder, size_preset, size_width, size_height, size_unit
             FROM documents WHERE type = 'normal' ORDER BY folder, created_at`,
          )
          .all() as Array<{
          id: string;
          title: string;
          folder: string | null;
          size_preset: string | null;
          size_width: number;
          size_height: number;
          size_unit: string;
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
            lines.push(`  ${d.title}\t(${d.id}, ${formatSize(d)})`);
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
      execute: async ({ query, docId }) => {
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
        const row = db().prepare('SELECT css FROM styles WHERE id = 1').get() as
          | { css: string }
          | undefined;

        if (!row) {
          throw new Error('Styles not found');
        }

        return numberLines(row.css);
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
        db()
          .prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1")
          .run(content);

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

        db()
          .prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1")
          .run(updated);

        return 'Edited styles.css';
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Type export
// ---------------------------------------------------------------------------

export type LithoToolName = keyof ReturnType<typeof createLithoTools>;
