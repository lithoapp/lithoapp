import { homedir } from 'node:os';
import { join } from 'node:path';

const WORKSPACES_BASE = join(homedir(), 'litho-workspaces');

export function workspacePath(workspace: string): string {
  return join(WORKSPACES_BASE, workspace);
}

export function pageFilePath(workspace: string, document: string, page: string): string {
  return join(WORKSPACES_BASE, workspace, 'documents', document, 'pages', `${page}.tsx`);
}
