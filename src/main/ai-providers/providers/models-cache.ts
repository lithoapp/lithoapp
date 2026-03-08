import { getAiDb } from '../db';
import type {
  CredentialApi,
  LithoModelsData,
  ModelInfo,
  OAuthConfig,
  ProviderInfo,
} from '../types';

let modelsCache: LithoModelsData | null = null;
let modelsCacheError: string | null = null;

export function loadCacheFromDb(): void {
  const row = getAiDb()
    .prepare('SELECT data, fetched_at FROM ai_models_cache WHERE id = 1')
    .get() as { data: string; fetched_at: string } | undefined;
  if (!row) return;
  try {
    modelsCache = JSON.parse(row.data) as LithoModelsData;
    modelsCacheError = null;
  } catch {
    // Corrupted cache row — ignore, will re-fetch
  }
}

export async function fetchModels(): Promise<void> {
  try {
    const response = await fetch('https://api.lithoapp.com/v1/models.json');
    if (!response.ok) throw new Error(`lithoapp API returned ${response.status}`);
    modelsCache = (await response.json()) as LithoModelsData;
    modelsCacheError = null;

    getAiDb()
      .prepare(
        `INSERT INTO ai_models_cache (id, data, fetched_at)
         VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           fetched_at = datetime('now')`,
      )
      .run(JSON.stringify(modelsCache));
  } catch (err) {
    modelsCacheError = err instanceof Error ? err.message : String(err);
  }
}

let readyPromise: Promise<void> | null = null;

/**
 * Initialize the models cache. Loads from DB immediately, then fetches
 * fresh data from network. Callers that need providers to be available
 * should await the returned promise.
 */
export function initModelsCache(onLoad?: () => void): Promise<void> {
  loadCacheFromDb();
  if (modelsCache) onLoad?.();

  // Always fetch fresh data on startup
  readyPromise = fetchModels().then(() => onLoad?.());

  return readyPromise;
}

/** Resolves when the models cache is populated (or fetch has been attempted). */
export function waitForModelsReady(): Promise<void> {
  return readyPromise ?? Promise.resolve();
}

export function getModelsCache(): LithoModelsData | null {
  return modelsCache;
}

export function getModelsCacheError(): string | null {
  return modelsCacheError;
}

export function getProviderInfo(providerId: string) {
  return modelsCache?.providers?.[providerId] ?? null;
}

export function getOAuthConfig(providerId: string): OAuthConfig | null {
  const provider = getProviderInfo(providerId);
  if (!provider) return null;
  const oauthMethod = provider.authMethods.find((m) => m.type === 'oauth');
  return oauthMethod?.oauth ?? null;
}

export function getProviderList(): ProviderInfo[] {
  if (!modelsCache) return [];
  return Object.values(modelsCache.providers).map((p) => ({
    id: p.id,
    name: p.name,
    api: p.baseUrl,
    modelCount: Object.keys(p.models).length,
    autoConnect: p.autoConnect,
    defaultModel: p.defaultModel,
    internalProvider: p.internalProvider,
  }));
}

export function getProviderModels(providerId: string): ModelInfo[] {
  if (!modelsCache) return [];
  const provider = modelsCache.providers[providerId];
  if (!provider) return [];
  return Object.values(provider.models).map((m) => ({
    id: m.id,
    name: m.name,
    contextWindow: m.contextWindow,
    maxOutput: m.maxOutput,
    inputCost: m.cost?.input,
    outputCost: m.cost?.output,
    capabilities: m.capabilities,
    authSupport: m.authSupport,
  }));
}

export function getModelInfo(providerId: string, modelId: string): ModelInfo | undefined {
  if (!modelsCache) return undefined;
  const provider = modelsCache.providers[providerId];
  if (!provider) return undefined;
  const model = provider.models[modelId];
  if (!model) return undefined;
  return {
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxOutput: model.maxOutput,
    inputCost: model.cost?.input,
    outputCost: model.cost?.output,
    capabilities: model.capabilities,
    authSupport: model.authSupport,
  };
}

export function autoConnectProviders(
  setCredentialFn: (id: string, cred: CredentialApi) => void,
  getConnectedFn: () => string[],
): void {
  const connected = getConnectedFn();
  for (const provider of getProviderList()) {
    if (provider.autoConnect && !connected.includes(provider.id)) {
      setCredentialFn(provider.id, { type: 'api', key: 'public' });
    }
  }
}
