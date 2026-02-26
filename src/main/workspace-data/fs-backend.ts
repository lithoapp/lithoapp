import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type {
  DesignSystem,
  DocumentConfig,
  DocumentInfo,
  PageSize,
  WorkspaceConfig,
} from '../../shared/types';
import { resolveWorkspacePath, WORKSPACES_BASE } from '../workspace-paths';
import {
  applyUpdates,
  categorizeTokens,
  DEFAULT_STYLES_CSS,
  defaultPageContent,
  parseThemeBlock,
  serializeFullCss,
  slugify,
} from './design-system-parser';

function wsPath(workspace: string): string {
  return resolveWorkspacePath(workspace);
}

function docsDir(workspace: string): string {
  return join(WORKSPACES_BASE, workspace, 'documents');
}

function docDir(workspace: string, document: string): string {
  return join(WORKSPACES_BASE, workspace, 'documents', document);
}

// ---------------------------------------------------------------------------
// Existing read-only functions
// ---------------------------------------------------------------------------

export async function listWorkspaces(): Promise<string[]> {
  if (!existsSync(WORKSPACES_BASE)) return [];
  return readdirSync(WORKSPACES_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function listDocuments(workspace: string): Promise<string[]> {
  const dir = docsDir(workspace);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function listPages(workspace: string, document: string): Promise<string[]> {
  const pagesDir = join(docDir(workspace, document), 'pages');
  return readdirSync(pagesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => entry.name.replace(/\.tsx$/, ''));
}

export async function getDocumentCount(workspace: string): Promise<number> {
  const dir = docsDir(workspace);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

export async function readWorkspaceConfig(workspace: string): Promise<WorkspaceConfig> {
  const configPath = join(wsPath(workspace), 'litho.json');
  return parseWorkspaceConfig(configPath);
}

function parseWorkspaceConfig(configPath: string): WorkspaceConfig {
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  return { name: raw.name ?? 'Untitled Workspace' };
}

export async function readDocumentConfig(
  workspace: string,
  document: string,
): Promise<DocumentConfig> {
  const configPath = join(docDir(workspace, document), 'document.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));

  const title: string = raw.title ?? document;
  const pages: string[] = raw.pages ?? [];

  let size: PageSize;
  if (typeof raw.size === 'string') {
    // Import PAGE_SIZES at runtime to avoid circular dependency
    const { PAGE_SIZES: sizes } = await import('../../shared/types');
    const preset = sizes[raw.size];
    if (!preset) {
      throw new Error(`Unknown page size preset "${raw.size}" in ${configPath}`);
    }
    size = preset;
  } else if (
    raw.size &&
    typeof raw.size.width === 'number' &&
    typeof raw.size.height === 'number' &&
    (raw.size.unit === 'mm' || raw.size.unit === 'px')
  ) {
    size = { width: raw.size.width, height: raw.size.height, unit: raw.size.unit };
  } else {
    throw new Error(`Invalid or missing "size" in ${configPath}`);
  }

  return { title, size, pages };
}

export async function readPageSource(
  workspace: string,
  document: string,
  page: string,
): Promise<string> {
  const pagePath = join(docDir(workspace, document), 'pages', `${page}.tsx`);
  return readFileSync(pagePath, 'utf-8');
}

export async function readStyles(workspace: string): Promise<string> {
  return readFileSync(join(wsPath(workspace), 'styles.css'), 'utf-8');
}

// ---------------------------------------------------------------------------
// Workspace creation
// ---------------------------------------------------------------------------

export async function createNewWorkspace(name: string): Promise<string> {
  const slug = slugify(name) || 'untitled';
  const root = resolveWorkspacePath(slug);

  if (existsSync(root)) {
    throw new Error(`A project named "${slug}" already exists. Choose a different name.`);
  }

  mkdirSync(join(root, 'assets'), { recursive: true });
  mkdirSync(join(root, 'documents'), { recursive: true });
  writeFileSync(join(root, 'litho.json'), JSON.stringify({ name }, null, 2));
  writeFileSync(join(root, 'styles.css'), DEFAULT_STYLES_CSS);

  return slug;
}

// ---------------------------------------------------------------------------
// Document CRUD
// ---------------------------------------------------------------------------

export async function createDocument(
  workspace: string,
  title: string,
  size: string | PageSize,
  folder?: string,
): Promise<string> {
  const slug = slugify(title) || 'untitled';
  const dir = docDir(workspace, slug);

  if (existsSync(dir)) {
    throw new Error(`A document named "${slug}" already exists.`);
  }

  // Resolve size if it's a preset name
  let resolvedSize: PageSize | string = size;
  if (typeof size === 'string') {
    const { PAGE_SIZES: sizes } = await import('../../shared/types');
    const preset = sizes[size];
    if (!preset) {
      throw new Error(`Unknown page size preset "${size}"`);
    }
    resolvedSize = size; // Keep as string for document.json
  }

  const pagesDir = join(dir, 'pages');
  mkdirSync(pagesDir, { recursive: true });

  const config: Record<string, unknown> = {
    title,
    size: resolvedSize,
    pages: ['page-1'],
    createdAt: new Date().toISOString(),
  };
  if (folder) config.folder = folder;

  writeFileSync(join(dir, 'document.json'), JSON.stringify(config, null, 2));
  writeFileSync(join(pagesDir, 'page-1.tsx'), defaultPageContent('page-1'));

  return slug;
}

export async function deleteDocument(workspace: string, document: string): Promise<void> {
  const dir = docDir(workspace, document);
  if (!existsSync(dir)) {
    throw new Error(`Document "${document}" not found.`);
  }
  rmSync(dir, { recursive: true, force: true });
}

export async function updateDocumentFolder(
  workspace: string,
  document: string,
  folder: string,
): Promise<void> {
  const configPath = join(docDir(workspace, document), 'document.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));

  if (folder) {
    raw.folder = folder;
  } else {
    delete raw.folder;
  }

  writeFileSync(configPath, JSON.stringify(raw, null, 2));
}

export async function listDocumentsFull(workspace: string): Promise<DocumentInfo[]> {
  const dir = docsDir(workspace);
  if (!existsSync(dir)) return [];

  const slugs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const docs: DocumentInfo[] = [];
  for (const slug of slugs) {
    try {
      const config = await readDocumentConfig(workspace, slug);
      const rawConfig = JSON.parse(readFileSync(join(dir, slug, 'document.json'), 'utf-8'));
      docs.push({
        slug,
        title: config.title,
        size: config.size,
        pages: config.pages,
        folder:
          typeof rawConfig.folder === 'string' && rawConfig.folder ? rawConfig.folder : undefined,
      });
    } catch {
      // Skip documents with invalid configs
    }
  }

  return docs;
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
  const stylesPath = join(wsPath(workspace), 'styles.css');
  const css = readFileSync(stylesPath, 'utf-8');
  const parsed = parseThemeBlock(css);
  const updatedTokens = applyUpdates(parsed.rawTokens, updates);
  const newCss = serializeFullCss(parsed, updatedTokens);
  writeFileSync(stylesPath, newCss);
}

// ---------------------------------------------------------------------------
// Asset file reading (for custom protocol)
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
  const fullPath = join(wsPath(workspace), 'assets', assetPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Asset not found: ${assetPath}`);
  }
  const data = readFileSync(fullPath);
  const ext = extname(fullPath).toLowerCase();
  const mimeType = MIME_MAP[ext] ?? 'application/octet-stream';
  return { data: Buffer.from(data), mimeType };
}
