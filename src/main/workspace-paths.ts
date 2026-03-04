import { join } from 'node:path';
import { app } from 'electron';

export const WORKSPACES_BASE = join(app.getPath('userData'), 'workspaces');

export function resolveWorkspacePath(name: string): string {
  return join(WORKSPACES_BASE, name);
}
