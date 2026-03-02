export async function connectWithApiKey(providerId: string, apiKey: string): Promise<void> {
  await window.litho.aiProvider.connectApiKey(providerId, apiKey.trim());
}

export async function disconnectProvider(providerId: string): Promise<void> {
  await window.litho.aiProvider.disconnect(providerId);
}

export async function startOAuth(
  providerId: string,
  mode?: string,
): Promise<{ url: string; verifier?: string; method: 'auto' | 'code' }> {
  return window.litho.aiProvider.startOAuth(providerId, mode);
}

export async function completeOAuth(
  providerId: string,
  code?: string,
  verifier?: string,
  mode?: string,
): Promise<void> {
  const result = await window.litho.aiProvider.completeOAuth(providerId, code, verifier, mode);
  if (!result.success) {
    throw new Error(result.error ?? 'OAuth failed');
  }
}

export async function connectFree(providerId: string): Promise<void> {
  await window.litho.aiProvider.connectFree(providerId);
}

export interface PingResult {
  text: string;
  reasoning: string;
  finishReason: string;
  modelId: string;
  latencyMs: number;
  error?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export async function pingProvider(providerId: string, modelId: string): Promise<PingResult> {
  return window.litho.aiProvider.ping(providerId, modelId);
}
