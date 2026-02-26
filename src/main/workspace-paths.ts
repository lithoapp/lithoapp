import { homedir } from 'node:os';
import { join } from 'node:path';

export const WORKSPACES_BASE = join(homedir(), 'litho-workspaces');

export function resolveWorkspacePath(name: string): string {
  return join(WORKSPACES_BASE, name);
}
