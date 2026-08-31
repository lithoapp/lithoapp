import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { createDiagnosticFetch } from '../lib/diagnostic-fetch';
import { createSseFilterFetch } from '../lib/sse-filter';
import { createOpenAIFetchWrapper } from '../oauth/openai-fetch';
import { CODEX_DEFAULT_MODEL, OAUTH_DUMMY_KEY } from '../oauth/openai-flow';
import type { CredentialApi } from '../types';
import { getCredential, setCredential } from './credential-store';
import { getModelsCache, getOAuthConfig } from './models-cache';

// ---------------------------------------------------------------------------
// Max output token cap (matches OpenCode's OUTPUT_TOKEN_MAX)
// ---------------------------------------------------------------------------

const OUTPUT_TOKEN_MAX = 32_000;

// ---------------------------------------------------------------------------
// Model construction — shared between ping and chat
// ---------------------------------------------------------------------------

export function createModel(providerId: string, modelId: string): LanguageModel {
  const providerData = getModelsCache()?.providers?.[providerId];

  const cred = getCredential(providerId);
  if (!cred) throw new Error(`No credentials found for provider: ${providerId}`);

  if (providerId === 'openai' && cred.type === 'oauth') {
    const clientId = getOAuthConfig('openai')?.clientId;
    if (!clientId) throw new Error('OpenAI OAuth client ID not configured');
    const oauthWrapper = createOpenAIFetchWrapper(
      cred,
      (c) => setCredential('openai', c),
      clientId,
    );
    const provider = createOpenAI({
      apiKey: OAUTH_DUMMY_KEY,
      fetch: createDiagnosticFetch(oauthWrapper),
    });
    const fallback = CODEX_DEFAULT_MODEL;
    const selected = modelId || fallback;
    return provider.responses(selected);
  }

  if (providerId === 'openai') {
    const provider = createOpenAI({
      apiKey: (cred as CredentialApi).key,
      fetch: createDiagnosticFetch(),
    });
    return provider.responses(modelId);
  }

  if (providerId === 'anthropic') {
    if (cred.type !== 'api') {
      throw new Error('Anthropic only supports API key authentication');
    }
    const provider = createAnthropic({
      apiKey: cred.key,
      fetch: createDiagnosticFetch(),
    });
    return provider(modelId);
  }

  const baseURL = providerData?.baseUrl;
  if (!baseURL) throw new Error(`No base URL configured for provider: ${providerId}`);
  const provider = createOpenAICompatible({
    name: providerId,
    baseURL,
    apiKey: (cred as CredentialApi).key,
    fetch: createSseFilterFetch(createDiagnosticFetch()),
  });
  return provider(modelId);
}

export { OUTPUT_TOKEN_MAX };
