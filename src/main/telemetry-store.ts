import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

export type Theme = 'dark' | 'light' | 'system';

interface AppPreferences {
  telemetryEnabled: boolean;
  name?: string;
  email?: string;
  theme: Theme;
}

const DEFAULTS: AppPreferences = {
  telemetryEnabled: true,
  theme: 'system',
};

function getStorePath(): string {
  return join(app.getPath('userData'), 'app-preferences.json');
}

function read(): AppPreferences {
  try {
    const raw = readFileSync(getStorePath(), 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(data: AppPreferences): void {
  const filePath = getStorePath();
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  renameSync(tmp, filePath);
}

export function getTelemetryEnabled(): boolean {
  return read().telemetryEnabled;
}

export function setTelemetryEnabled(value: boolean): void {
  write({ ...read(), telemetryEnabled: value });
}

export function getUserProfile(): { name: string | null; email: string | null } {
  const prefs = read();
  return { name: prefs.name ?? null, email: prefs.email ?? null };
}

export function setUserProfile(name: string, email: string): void {
  write({ ...read(), name, email });
}

export function getTheme(): Theme {
  return read().theme;
}

export function setTheme(value: Theme): void {
  write({ ...read(), theme: value });
}

export function resetPreferences(): void {
  write({ ...DEFAULTS });
}
