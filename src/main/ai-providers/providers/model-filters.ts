import type { ModelInfo } from '../types';
import { getCredential } from './credential-store';

export function filterModelsForProvider(providerId: string, models: ModelInfo[]): ModelInfo[] {
  const cred = getCredential(providerId);
  if (!cred) return models;

  // Map credential type to the authSupport key used in the API
  const authKey = cred.type === 'oauth' ? 'oauth' : 'api_key';

  // Models with no authSupport are unrestricted; otherwise require the matching key
  return models.filter((m) => !m.authSupport?.length || m.authSupport.includes(authKey));
}
