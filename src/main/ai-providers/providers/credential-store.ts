import { safeStorage } from 'electron';
import { getAiDb } from '../db';
import type { Credential } from '../types';

function encrypt(cred: Credential): string {
  return safeStorage.encryptString(JSON.stringify(cred)).toString('base64');
}

function decrypt(blob: string): Credential {
  const json = safeStorage.decryptString(Buffer.from(blob, 'base64'));
  return JSON.parse(json) as Credential;
}

export function getCredential(providerId: string): Credential | undefined {
  const row = getAiDb()
    .prepare('SELECT credential_blob FROM ai_credentials WHERE provider_id = ?')
    .get(providerId) as { credential_blob: string } | undefined;
  if (!row) return undefined;
  try {
    return decrypt(row.credential_blob);
  } catch {
    return undefined;
  }
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
    .run(providerId, cred.type, encrypt(cred));
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
