import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

interface StoreData {
  activeWorkspace: string | null;
}

const DEFAULTS: StoreData = { activeWorkspace: null };

function getStorePath(): string {
  return join(app.getPath('userData'), 'active-workspace.json');
}

function read(): StoreData {
  try {
    const raw = readFileSync(getStorePath(), 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(data: StoreData): void {
  const filePath = getStorePath();
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, filePath);
}

export function getActiveWorkspace(): string | null {
  return read().activeWorkspace;
}

export function setActiveWorkspace(name: string | null): void {
  write({ activeWorkspace: name });
}

export function clearActiveWorkspace(): void {
  write({ activeWorkspace: null });
}
