import type { CredentialApi, ModelInfo } from '../types';
import { getCredential } from './credential-store';

// ---------------------------------------------------------------------------
// Free models (OpenCode Zen with public key)
// ---------------------------------------------------------------------------

const OPENCODE_FREE_MODELS = new Set([
  'trinity-large-preview-free',
  'kimi-k2.5-free',
  'grok-code',
  'glm-5-free',
  'minimax-m2.1-free',
  'minimax-m2.5-free',
  'glm-4.7-free',
  'gpt-5-nano',
  'big-pickle',
]);

// ---------------------------------------------------------------------------
// Codex models (OpenAI OAuth)
// ---------------------------------------------------------------------------

const CODEX_ALLOWED_MODELS = new Set([
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-mini',
  'gpt-5.2',
  'gpt-5.2-codex',
  'gpt-5.3-codex',
  'gpt-5.1-codex',
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function filterModelsForProvider(providerId: string, models: ModelInfo[]): ModelInfo[] {
  if (providerId === 'opencode') {
    const cred = getCredential('opencode');
    if (cred?.type === 'api' && (cred as CredentialApi).key === 'public') {
      return models.filter((m) => OPENCODE_FREE_MODELS.has(m.id));
    }
    return models;
  }

  if (providerId === 'openai') {
    const cred = getCredential('openai');
    if (cred?.type === 'oauth') {
      const codexModels = models.filter(
        (m) => m.id.includes('codex') || CODEX_ALLOWED_MODELS.has(m.id),
      );
      if (!codexModels.some((m) => m.id === 'gpt-5.3-codex')) {
        codexModels.push({
          id: 'gpt-5.3-codex',
          name: 'GPT-5.3 Codex',
          capabilities: ['reasoning', 'tool_call', 'attachment', 'vision'],
        });
      }
      return codexModels;
    }
  }

  return models;
}
