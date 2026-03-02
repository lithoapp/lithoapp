import { streamText } from 'ai';
import type { PingResult } from '../types';
import { createModel } from './create-model';
import { getCredential } from './credential-store';

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------

export async function pingProvider(providerId: string, modelId: string): Promise<PingResult> {
  const model = createModel(providerId, modelId);

  const cred = getCredential(providerId);
  const isOAuthCodex = providerId === 'openai' && cred?.type === 'oauth';
  const start = performance.now();

  const result = streamText({
    model,
    system: 'You are a helpful assistant. Follow instructions exactly.',
    prompt: 'Reply with only the word: Pong',
    // Reasoning models burn tokens on thinking — 100 leaves plenty for "Pong"
    ...(isOAuthCodex ? {} : { maxOutputTokens: 100 }),
  });
  const text = await result.text;
  const reasoningText = await result.reasoningText;
  const finishReason = await result.finishReason;
  const usage = await result.usage;
  const warnings = await result.warnings;
  const latencyMs = Math.round(performance.now() - start);

  const warningMessages = warnings
    ?.map((w) => ('message' in w ? String(w.message) : JSON.stringify(w)))
    .join('; ');

  return {
    text,
    reasoning: reasoningText ?? '',
    finishReason,
    modelId,
    latencyMs,
    ...(finishReason === 'error' && {
      error: warningMessages || 'Stream finished with error (provider returned invalid response)',
    }),
    usage: {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    },
  };
}
