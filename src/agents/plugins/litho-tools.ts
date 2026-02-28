import { Database } from 'bun:sqlite';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { type Plugin, tool } from '@opencode-ai/plugin';
import { replace } from './replace';

// ─── Database helpers ────────────────────────────────────────────────────────

function openDb(directory: string): Database {
  const dbPath = join(directory, 'workspace.db');
  const db = new Database(dbPath, { readwrite: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

function numberLines(content: string): string {
  return content
    .split('\n')
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
}

function generateId(): string {
  return randomBytes(9).toString('base64url').slice(0, 12);
}

// ─── listPages ──────────────────────────────────────────────────────────────

const listPages = tool({
  description: 'List all pages in a document with their IDs, names, and descriptions.',
  args: {
    docId: tool.schema.string().describe('Document ID'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      const rows = db
        .prepare('SELECT id, name, description FROM pages WHERE document_id = ? ORDER BY position')
        .all(args.docId) as Array<{ id: string; name: string; description: string }>;

      if (rows.length === 0) {
        return '(no pages yet — use createPage to add one)';
      }

      return rows.map((r) => `${r.id}\t${r.name}\t${r.description}`).join('\n');
    } finally {
      db.close();
    }
  },
});

// ─── readPage ───────────────────────────────────────────────────────────────

const readPage = tool({
  description: 'Read the source of a document page. Returns the page content with line numbers.',
  args: {
    docId: tool.schema.string().describe('Document ID'),
    pageId: tool.schema.string().describe('Page ID'),
    offset: tool.schema
      .number()
      .optional()
      .describe('1-indexed line number to start from (default: 1)'),
    limit: tool.schema
      .number()
      .optional()
      .describe('Maximum number of lines to return (default: 2000)'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      const row = db
        .prepare('SELECT source FROM pages WHERE id = ? AND document_id = ?')
        .get(args.pageId, args.docId) as { source: string } | undefined;

      if (!row) {
        throw new Error(`Page "${args.pageId}" not found in document "${args.docId}"`);
      }

      const lines = row.source.split('\n');
      const offset = Math.max(1, args.offset ?? 1);
      const limit = args.limit ?? 2000;
      const sliced = lines.slice(offset - 1, offset - 1 + limit);

      const numbered = sliced.map((line, i) => `${offset + i}: ${line}`).join('\n');

      const total = lines.length;
      const end = offset - 1 + sliced.length;
      const suffix =
        end < total ? `\n\n(${total - end} more lines — use offset=${end + 1} to continue)` : '';

      return numbered + suffix;
    } finally {
      db.close();
    }
  },
});

// ─── writePage ──────────────────────────────────────────────────────────────

const writePage = tool({
  description:
    'Replace the entire content of a document page. Use for full rewrites or major restructuring.',
  args: {
    docId: tool.schema.string().describe('Document ID'),
    pageId: tool.schema.string().describe('Page ID'),
    content: tool.schema.string().describe('Full TSX source for the page'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      const result = db
        .prepare(
          "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
        )
        .run(args.content, args.pageId, args.docId);

      if (result.changes === 0) {
        throw new Error(`Page "${args.pageId}" not found in document "${args.docId}"`);
      }

      const lineCount = args.content.split('\n').length;
      return `Wrote ${args.pageId} (${lineCount} lines)`;
    } finally {
      db.close();
    }
  },
});

// ─── editPage ───────────────────────────────────────────────────────────────

const editPage = tool({
  description:
    'Edit a document page by replacing a specific string. ' +
    'Uses fuzzy matching to handle minor whitespace and indentation differences.',
  args: {
    docId: tool.schema.string().describe('Document ID'),
    pageId: tool.schema.string().describe('Page ID'),
    oldString: tool.schema.string().describe('The text to replace'),
    newString: tool.schema.string().describe('The replacement text (must differ from oldString)'),
    replaceAll: tool.schema
      .boolean()
      .optional()
      .describe('Replace all occurrences (default: false)'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      const row = db
        .prepare('SELECT source FROM pages WHERE id = ? AND document_id = ?')
        .get(args.pageId, args.docId) as { source: string } | undefined;

      if (!row) {
        throw new Error(`Page "${args.pageId}" not found in document "${args.docId}"`);
      }

      const updated = replace(row.source, args.oldString, args.newString, args.replaceAll);

      db.prepare(
        "UPDATE pages SET source = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
      ).run(updated, args.pageId, args.docId);

      return `Edited ${args.pageId}`;
    } finally {
      db.close();
    }
  },
});

// ─── readMainCss ────────────────────────────────────────────────────────────

const readMainCss = tool({
  description:
    'Read the workspace styles.css file. Returns the design system CSS with line numbers.',
  args: {},
  async execute(_args, context) {
    const db = openDb(context.directory);
    try {
      const row = db.prepare('SELECT css FROM styles WHERE id = 1').get() as
        | { css: string }
        | undefined;

      if (!row) {
        throw new Error('Styles not found');
      }

      return numberLines(row.css);
    } finally {
      db.close();
    }
  },
});

// ─── writeMainCss ───────────────────────────────────────────────────────────

const writeMainCss = tool({
  description: 'Replace the entire workspace styles.css file. Use for full design system rewrites.',
  args: {
    content: tool.schema.string().describe('Full CSS source for styles.css'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      db.prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1").run(
        args.content,
      );

      const lineCount = args.content.split('\n').length;
      return `Wrote styles.css (${lineCount} lines)`;
    } finally {
      db.close();
    }
  },
});

// ─── editMainCss ────────────────────────────────────────────────────────────

const editMainCss = tool({
  description:
    'Edit the workspace styles.css by replacing a specific string. ' +
    'Uses fuzzy matching to handle minor whitespace and indentation differences.',
  args: {
    oldString: tool.schema.string().describe('The text to replace'),
    newString: tool.schema.string().describe('The replacement text (must differ from oldString)'),
    replaceAll: tool.schema
      .boolean()
      .optional()
      .describe('Replace all occurrences (default: false)'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      const row = db.prepare('SELECT css FROM styles WHERE id = 1').get() as
        | { css: string }
        | undefined;

      if (!row) {
        throw new Error('Styles not found');
      }

      const updated = replace(row.css, args.oldString, args.newString, args.replaceAll);

      db.prepare("UPDATE styles SET css = ?, updated_at = datetime('now') WHERE id = 1").run(
        updated,
      );

      return 'Edited styles.css';
    } finally {
      db.close();
    }
  },
});

// ─── createPage ─────────────────────────────────────────────────────────────

const createPage = tool({
  description:
    'Create a new page in a document. Requires a name (1-2 words) and a short description (5-8 words). Returns the new page ID.',
  args: {
    docId: tool.schema.string().describe('Document ID'),
    name: tool.schema
      .string()
      .describe(
        'Short page name (1-2 words, max 30 chars). Examples: "Cover", "Pricing", "Team Bio"',
      ),
    description: tool.schema
      .string()
      .optional()
      .describe('Short description of the page content (5-8 words)'),
    afterPageId: tool.schema
      .string()
      .optional()
      .describe('Insert after this page ID. Appends to end if omitted.'),
  },
  async execute(args, context) {
    const trimmedName = args.name.trim();
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

    const db = openDb(context.directory);
    try {
      const pages = db
        .prepare('SELECT id, position FROM pages WHERE document_id = ? ORDER BY position')
        .all(args.docId) as Array<{ id: string; position: number }>;

      if (pages.length === 0) {
        // Verify document exists
        const doc = db.prepare('SELECT id FROM documents WHERE id = ?').get(args.docId);
        if (!doc) {
          throw new Error(`Document "${args.docId}" not found`);
        }
      }

      let position: number;

      if (args.afterPageId) {
        const afterIdx = pages.findIndex((p) => p.id === args.afterPageId);
        if (afterIdx === -1) throw new Error(`Page "${args.afterPageId}" not found`);

        const afterPos = pages[afterIdx].position;
        const nextPos = afterIdx + 1 < pages.length ? pages[afterIdx + 1].position : afterPos + 2;
        position = (afterPos + nextPos) / 2;
      } else {
        const maxPos = pages.length > 0 ? pages[pages.length - 1].position : 0;
        position = maxPos + 1;
      }

      const newPageId = generateId();
      const description = args.description ?? 'Blank page';
      const pageContent = `import '@styles.css'\n\nexport default function Page() {\n  return (\n    <div className="w-full h-full bg-white p-12 flex flex-col">\n    </div>\n  )\n}\n`;

      db.prepare(
        'INSERT INTO pages (id, document_id, name, description, source, position) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(newPageId, args.docId, trimmedName, description, pageContent, position);

      return `Created ${newPageId}`;
    } finally {
      db.close();
    }
  },
});

// ─── deletePage ─────────────────────────────────────────────────────────────

const deletePage = tool({
  description: 'Delete a page from a document.',
  args: {
    docId: tool.schema.string().describe('Document ID'),
    pageId: tool.schema.string().describe('Page ID to delete'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      const result = db
        .prepare('DELETE FROM pages WHERE id = ? AND document_id = ?')
        .run(args.pageId, args.docId);

      if (result.changes === 0) throw new Error(`Page "${args.pageId}" not found`);

      return `Deleted ${args.pageId}`;
    } finally {
      db.close();
    }
  },
});

// ─── updatePageDescription ──────────────────────────────────────────────────

const updatePageDescription = tool({
  description: "Update a page's description after major content changes. Keep it to 5-8 words.",
  args: {
    docId: tool.schema.string().describe('Document ID'),
    pageId: tool.schema.string().describe('Page ID'),
    description: tool.schema.string().describe('New short description (5-8 words)'),
  },
  async execute(args, context) {
    const db = openDb(context.directory);
    try {
      const result = db
        .prepare(
          "UPDATE pages SET description = ?, updated_at = datetime('now') WHERE id = ? AND document_id = ?",
        )
        .run(args.description, args.pageId, args.docId);

      if (result.changes === 0) {
        throw new Error(`Page "${args.pageId}" not found in document "${args.docId}"`);
      }

      return `Updated description for ${args.pageId}`;
    } finally {
      db.close();
    }
  },
});

// ─── Plugin export ──────────────────────────────────────────────────────────

export const lithoPlugin: Plugin = async () => ({
  tool: {
    listPages,
    readPage,
    writePage,
    editPage,
    readMainCss,
    writeMainCss,
    editMainCss,
    createPage,
    deletePage,
    updatePageDescription,
  },
});
