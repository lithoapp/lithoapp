import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  type DocumentConfig,
  PAGE_SIZES,
  type PageSize,
  type WorkspaceConfig,
} from '../../shared/types';

const WORKSPACES_BASE = join(homedir(), 'litho-workspaces');

function wsPath(workspace: string): string {
  return join(WORKSPACES_BASE, workspace);
}

function docsDir(workspace: string): string {
  return join(WORKSPACES_BASE, workspace, 'documents');
}

function docDir(workspace: string, document: string): string {
  return join(WORKSPACES_BASE, workspace, 'documents', document);
}

export async function listWorkspaces(): Promise<string[]> {
  return readdirSync(WORKSPACES_BASE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export async function listDocuments(workspace: string): Promise<string[]> {
  return readdirSync(docsDir(workspace), { withFileTypes: true })
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

export async function getDocumentCountByPath(workspacePath: string): Promise<number> {
  const dir = join(workspacePath, 'documents');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

export async function readWorkspaceConfig(workspace: string): Promise<WorkspaceConfig> {
  const configPath = join(wsPath(workspace), 'litho.json');
  return parseWorkspaceConfig(configPath);
}

export async function readWorkspaceConfigByPath(workspacePath: string): Promise<WorkspaceConfig> {
  const configPath = join(workspacePath, 'litho.json');
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
    const preset = PAGE_SIZES[raw.size];
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
