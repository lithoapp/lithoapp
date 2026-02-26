import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Plugin, tool } from '@opencode-ai/plugin';
import { replace } from './replace';

// ─── Helpers ────────────────────────────────────────────────────────────────

function pagePath(directory: string, slug: string, pageId: string): string {
  return join(directory, 'documents', slug, 'pages', `${pageId}.tsx`);
}

function docJsonPath(directory: string, slug: string): string {
  return join(directory, 'documents', slug, 'document.json');
}

function stylesPath(directory: string): string {
  return join(directory, 'styles.css');
}

async function readDocJson(directory: string, slug: string) {
  const raw = await readFile(docJsonPath(directory, slug), 'utf-8');
  return JSON.parse(raw);
}

async function touchDocTimestamp(directory: string, slug: string) {
  const path = docJsonPath(directory, slug);
  const doc = JSON.parse(await readFile(path, 'utf-8'));
  doc.updatedAt = new Date().toISOString();
  await writeFile(path, JSON.stringify(doc, null, 2));
}

function assertPageExists(doc: { pages: string[] }, slug: string, pageId: string) {
  if (!doc.pages.includes(pageId)) {
    throw new Error(
      `Page "${pageId}" not found in ${slug}. Available pages: ${doc.pages.join(', ')}`,
    );
  }
}

function numberLines(content: string): string {
  return content
    .split('\n')
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
}

// ─── listPages ──────────────────────────────────────────────────────────────

const listPages = tool({
  description: 'List all page IDs in a document, in order.',
  args: {
    slug: tool.schema.string().describe('Document slug'),
  },
  async execute(args, context) {
    const doc = await readDocJson(context.directory, args.slug);
    return (doc.pages as string[]).join('\n');
  },
});

// ─── readPage ───────────────────────────────────────────────────────────────

const readPage = tool({
  description: 'Read the source of a document page. Returns the page content with line numbers.',
  args: {
    slug: tool.schema.string().describe('Document slug'),
    pageId: tool.schema.string().describe('Page ID (e.g. "page-1")'),
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
    const doc = await readDocJson(context.directory, args.slug);
    assertPageExists(doc, args.slug, args.pageId);

    const content = await readFile(pagePath(context.directory, args.slug, args.pageId), 'utf-8');
    const lines = content.split('\n');

    const offset = Math.max(1, args.offset ?? 1);
    const limit = args.limit ?? 2000;
    const sliced = lines.slice(offset - 1, offset - 1 + limit);

    const numbered = sliced.map((line, i) => `${offset + i}: ${line}`).join('\n');

    const total = lines.length;
    const end = offset - 1 + sliced.length;
    const suffix =
      end < total ? `\n\n(${total - end} more lines — use offset=${end + 1} to continue)` : '';

    return numbered + suffix;
  },
});

// ─── writePage ──────────────────────────────────────────────────────────────

const writePage = tool({
  description:
    'Replace the entire content of a document page. Use for full rewrites or major restructuring.',
  args: {
    slug: tool.schema.string().describe('Document slug'),
    pageId: tool.schema.string().describe('Page ID (e.g. "page-1")'),
    content: tool.schema.string().describe('Full TSX source for the page'),
  },
  async execute(args, context) {
    const doc = await readDocJson(context.directory, args.slug);
    assertPageExists(doc, args.slug, args.pageId);

    await writeFile(pagePath(context.directory, args.slug, args.pageId), args.content);
    await touchDocTimestamp(context.directory, args.slug);

    const lineCount = args.content.split('\n').length;
    return `Wrote ${args.pageId} in ${args.slug} (${lineCount} lines)`;
  },
});

// ─── editPage ───────────────────────────────────────────────────────────────

const editPage = tool({
  description:
    'Edit a document page by replacing a specific string. ' +
    'Uses fuzzy matching to handle minor whitespace and indentation differences.',
  args: {
    slug: tool.schema.string().describe('Document slug'),
    pageId: tool.schema.string().describe('Page ID (e.g. "page-1")'),
    oldString: tool.schema.string().describe('The text to replace'),
    newString: tool.schema.string().describe('The replacement text (must differ from oldString)'),
    replaceAll: tool.schema
      .boolean()
      .optional()
      .describe('Replace all occurrences (default: false)'),
  },
  async execute(args, context) {
    const doc = await readDocJson(context.directory, args.slug);
    assertPageExists(doc, args.slug, args.pageId);

    const path = pagePath(context.directory, args.slug, args.pageId);
    const content = await readFile(path, 'utf-8');
    const updated = replace(content, args.oldString, args.newString, args.replaceAll);

    await writeFile(path, updated);
    await touchDocTimestamp(context.directory, args.slug);

    return `Edited ${args.pageId} in ${args.slug}`;
  },
});

// ─── readMainCss ────────────────────────────────────────────────────────────

const readMainCss = tool({
  description:
    'Read the workspace styles.css file. Returns the design system CSS with line numbers.',
  args: {},
  async execute(_args, context) {
    const content = await readFile(stylesPath(context.directory), 'utf-8');
    return numberLines(content);
  },
});

// ─── writeMainCss ───────────────────────────────────────────────────────────

const writeMainCss = tool({
  description: 'Replace the entire workspace styles.css file. Use for full design system rewrites.',
  args: {
    content: tool.schema.string().describe('Full CSS source for styles.css'),
  },
  async execute(args, context) {
    await writeFile(stylesPath(context.directory), args.content);

    const lineCount = args.content.split('\n').length;
    return `Wrote styles.css (${lineCount} lines)`;
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
    const path = stylesPath(context.directory);
    const content = await readFile(path, 'utf-8');
    const updated = replace(content, args.oldString, args.newString, args.replaceAll);

    await writeFile(path, updated);

    return 'Edited styles.css';
  },
});

// ─── createPage ─────────────────────────────────────────────────────────────

const createPage = tool({
  description: 'Create a new page in a document. Returns the new page ID.',
  args: {
    slug: tool.schema.string().describe('Document slug'),
    afterPageId: tool.schema
      .string()
      .optional()
      .describe('Insert after this page ID. Appends to end if omitted.'),
  },
  async execute(args, context) {
    const path = docJsonPath(context.directory, args.slug);
    const doc = JSON.parse(await readFile(path, 'utf-8'));

    const maxNum = doc.pages
      .map((p: string) => parseInt(p.replace('page-', ''), 10))
      .filter((n: number) => !Number.isNaN(n))
      .reduce((max: number, n: number) => Math.max(max, n), 0);
    const newPageId = `page-${maxNum + 1}`;

    if (args.afterPageId) {
      const idx = doc.pages.indexOf(args.afterPageId);
      if (idx === -1) throw new Error(`Page "${args.afterPageId}" not found`);
      doc.pages.splice(idx + 1, 0, newPageId);
    } else {
      doc.pages.push(newPageId);
    }

    const pagesDir = join(context.directory, 'documents', args.slug, 'pages');
    await mkdir(pagesDir, { recursive: true });
    const pageContent = `import '@styles.css'\n\nexport default function Page() {\n  return (\n    <div className="w-full h-full bg-white p-12 flex flex-col">\n    </div>\n  )\n}\n`;
    await writeFile(join(pagesDir, `${newPageId}.tsx`), pageContent);

    doc.updatedAt = new Date().toISOString();
    await writeFile(path, JSON.stringify(doc, null, 2));

    return `Created ${newPageId} in documents/${args.slug}/pages/${newPageId}.tsx`;
  },
});

// ─── deletePage ─────────────────────────────────────────────────────────────

const deletePage = tool({
  description: 'Delete a page from a document.',
  args: {
    slug: tool.schema.string().describe('Document slug'),
    pageId: tool.schema.string().describe('Page ID to delete'),
  },
  async execute(args, context) {
    const path = docJsonPath(context.directory, args.slug);
    const doc = JSON.parse(await readFile(path, 'utf-8'));

    const idx = doc.pages.indexOf(args.pageId);
    if (idx === -1) throw new Error(`Page "${args.pageId}" not found`);
    if (doc.pages.length === 1) throw new Error('Cannot delete the last page');

    doc.pages.splice(idx, 1);

    await unlink(pagePath(context.directory, args.slug, args.pageId));

    doc.updatedAt = new Date().toISOString();
    await writeFile(path, JSON.stringify(doc, null, 2));

    return `Deleted ${args.pageId} from ${args.slug}`;
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
  },
});
