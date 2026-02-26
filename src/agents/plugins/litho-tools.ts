import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Plugin, tool } from '@opencode-ai/plugin';

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
    const docJsonPath = join(context.directory, 'documents', args.slug, 'document.json');
    const doc = JSON.parse(await readFile(docJsonPath, 'utf-8'));

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
    await writeFile(docJsonPath, JSON.stringify(doc, null, 2));

    return `Created ${newPageId} in documents/${args.slug}/pages/${newPageId}.tsx`;
  },
});

const deletePage = tool({
  description: 'Delete a page from a document.',
  args: {
    slug: tool.schema.string().describe('Document slug'),
    pageId: tool.schema.string().describe('Page ID to delete'),
  },
  async execute(args, context) {
    const docJsonPath = join(context.directory, 'documents', args.slug, 'document.json');
    const doc = JSON.parse(await readFile(docJsonPath, 'utf-8'));

    const idx = doc.pages.indexOf(args.pageId);
    if (idx === -1) throw new Error(`Page "${args.pageId}" not found`);
    if (doc.pages.length === 1) throw new Error('Cannot delete the last page');

    doc.pages.splice(idx, 1);

    const pagePath = join(context.directory, 'documents', args.slug, 'pages', `${args.pageId}.tsx`);
    await unlink(pagePath);

    doc.updatedAt = new Date().toISOString();
    await writeFile(docJsonPath, JSON.stringify(doc, null, 2));

    return `Deleted ${args.pageId} from ${args.slug}`;
  },
});

export const lithoPlugin: Plugin = async () => ({
  tool: { createPage, deletePage },
});
