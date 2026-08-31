import { safeStorage } from 'electron';
import { getAiDb } from '../db';
import type { Credential } from '../types';

const ENCRYPTED_PREFIX = 'enc:';

function encodeCredential(cred: Credential): string {
  const json = JSON.stringify(cred);
  if (!safeStorage.isEncryptionAvailable()) return json;
  return ENCRYPTED_PREFIX + safeStorage.encryptString(json).toString('base64');
}

function decodeCredential(blob: string): Credential | undefined {
  try {
    if (blob.startsWith(ENCRYPTED_PREFIX)) {
      const buf = Buffer.from(blob.slice(ENCRYPTED_PREFIX.length), 'base64');
      return JSON.parse(safeStorage.decryptString(buf)) as Credential;
    }
    return JSON.parse(blob) as Credential;
  } catch {
    return undefined;
  }
}

export function getCredential(providerId: string): Credential | undefined {
  const row = getAiDb()
    .prepare('SELECT credential_blob FROM ai_credentials WHERE provider_id = ?')
    .get(providerId) as { credential_blob: string } | undefined;
  if (!row) return undefined;
  return decodeCredential(row.credential_blob);
}

export function setCredential(providerId: string, cred: Credential): void {
  getAiDb()
    .prepare(
      `INSERT INTO ai_credentials (provider_id, credential_type, credential_blob, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(provider_id) DO UPDATE SET
         credential_type = excluded.credential_type,
         credential_blob = excluded.credential_blob,
         updated_at = datetime('now')`,
    )
    .run(providerId, cred.type, encodeCredential(cred));
}

export function removeCredential(providerId: string): void {
  getAiDb().prepare('DELETE FROM ai_credentials WHERE provider_id = ?').run(providerId);
}

export function getConnectedProviderIds(): string[] {
  const rows = getAiDb().prepare('SELECT provider_id FROM ai_credentials').all() as {
    provider_id: string;
  }[];
  return rows.map((r) => r.provider_id);
}

export function clearAllCredentials(): void {
  getAiDb().exec('DELETE FROM ai_credentials');
}
