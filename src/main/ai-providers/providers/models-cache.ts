import { getAiDb } from '../db';
import type { ModelInfo, ModelsDevData, ProviderInfo } from '../types';

const STALE_MS = 60 * 60 * 1000; // 1 hour

let modelsDevCache: ModelsDevData | null = null;
let modelsDevError: string | null = null;

export function loadCacheFromDb(): void {
  const row = getAiDb()
    .prepare('SELECT data, fetched_at FROM ai_models_dev_cache WHERE id = 1')
    .get() as { data: string; fetched_at: string } | undefined;
  if (!row) return;
  try {
    modelsDevCache = JSON.parse(row.data) as ModelsDevData;
    modelsDevError = null;
  } catch {
    // Corrupted cache row — ignore, will re-fetch
  }
}

function isCacheStale(): boolean {
  const row = getAiDb().prepare('SELECT fetched_at FROM ai_models_dev_cache WHERE id = 1').get() as
    | { fetched_at: string }
    | undefined;
  if (!row) return true;
  const fetchedAt = new Date(`${row.fetched_at}Z`).getTime();
  return Date.now() - fetchedAt > STALE_MS;
}

export async function fetchModelsDev(): Promise<void> {
  try {
    const response = await fetch('https://models.dev/api.json');
    if (!response.ok) throw new Error(`models.dev returned ${response.status}`);
    modelsDevCache = (await response.json()) as ModelsDevData;
    modelsDevError = null;

    // Persist to SQLite
    getAiDb()
      .prepare(
        `INSERT INTO ai_models_dev_cache (id, data, fetched_at)
         VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           fetched_at = datetime('now')`,
      )
      .run(JSON.stringify(modelsDevCache));
  } catch (err) {
    modelsDevError = err instanceof Error ? err.message : String(err);
  }
}

export function initModelsCache(): void {
  loadCacheFromDb();
  if (isCacheStale()) {
    void fetchModelsDev();
  }
}

export function getModelsDevCache(): ModelsDevData | null {
  return modelsDevCache;
}

export function getModelsDevError(): string | null {
  return modelsDevError;
}

export function getProviderList(): ProviderInfo[] {
  if (!modelsDevCache) return [];
  return Object.values(modelsDevCache).map((p) => ({
    id: p.id,
    name: p.name,
    env: p.env,
    npm: p.npm,
    api: p.api,
    modelCount: Object.keys(p.models).length,
  }));
}

export function getProviderModels(providerId: string): ModelInfo[] {
  if (!modelsDevCache) return [];
  const provider = modelsDevCache[providerId];
  if (!provider) return [];
  return Object.values(provider.models).map((m) => {
    const capabilities: string[] = [];
    if (m.reasoning) capabilities.push('reasoning');
    if (m.tool_call) capabilities.push('tool_call');
    if (m.attachment) capabilities.push('attachment');
    if (m.temperature) capabilities.push('temperature');
    if (m.modalities?.input?.includes('image')) capabilities.push('vision');

    return {
      id: m.id,
      name: m.name,
      family: m.family,
      contextWindow: m.limit?.context,
      maxOutput: m.limit?.output,
      inputCost: m.cost?.input,
      outputCost: m.cost?.output,
      capabilities,
    };
  });
}

export function getModelInfo(providerId: string, modelId: string): ModelInfo | undefined {
  if (!modelsDevCache) return undefined;
  const provider = modelsDevCache[providerId];
  if (!provider) return undefined;
  const model = provider.models[modelId];
  if (!model) return undefined;

  const capabilities: string[] = [];
  if (model.reasoning) capabilities.push('reasoning');
  if (model.tool_call) capabilities.push('tool_call');
  if (model.attachment) capabilities.push('attachment');
  if (model.temperature) capabilities.push('temperature');
  if (model.modalities?.input?.includes('image')) capabilities.push('vision');

  return {
    id: model.id,
    name: model.name,
    family: model.family,
    contextWindow: model.limit?.context,
    maxOutput: model.limit?.output,
    inputCost: model.cost?.input,
    outputCost: model.cost?.output,
    capabilities,
  };
}
