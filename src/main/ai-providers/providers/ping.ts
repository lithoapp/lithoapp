import { streamText } from 'ai';
import { parseError } from '../lib/parse-error';
import { CODEX_ORIGINATOR, codexUserAgent } from '../oauth/client-identity';
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

  const pingSystem = 'You are a helpful assistant. Follow instructions exactly.';

  const result = streamText({
    model,
    messages: [
      { role: 'system' as const, content: pingSystem },
      { role: 'user' as const, content: 'Reply with only the word: Pong' },
    ],
    maxRetries: 0,
    headers: isOAuthCodex
      ? {
          originator: CODEX_ORIGINATOR,
          'User-Agent': codexUserAgent(),
          session_id: 'ping',
        }
      : {},
    providerOptions: {
      openai: {
        store: false,
        ...(isOAuthCodex ? { instructions: pingSystem } : {}),
      },
    },
    // Reasoning models burn tokens on thinking — 100 leaves plenty for "Pong"
    ...(isOAuthCodex ? {} : { maxOutputTokens: 100 }),
  });

  let text = '';
  let reasoningText = '';
  let finishReason = 'unknown';
  let inputTokens = 0;
  let outputTokens = 0;

  const errorResult = (message: string): PingResult => ({
    text: '',
    reasoning: '',
    finishReason: 'error',
    modelId,
    latencyMs: Math.round(performance.now() - start),
    error: message,
  });

  try {
    // biome-ignore lint/suspicious/noExplicitAny: stream part is a wide union
    for await (const part of result.fullStream as AsyncIterable<any>) {
      if (part.type === 'text-delta') {
        text += part.text ?? part.textDelta ?? '';
      } else if (part.type === 'reasoning') {
        reasoningText += part.text ?? part.reasoningText ?? '';
      } else if (part.type === 'finish') {
        finishReason = part.finishReason ?? 'unknown';
        inputTokens = part.totalUsage?.inputTokens ?? 0;
        outputTokens = part.totalUsage?.outputTokens ?? 0;
      } else if (part.type === 'error') {
        return errorResult(parseError(part.error).message);
      }
    }
  } catch (err) {
    return errorResult(parseError(err).message);
  }

  return {
    text,
    reasoning: reasoningText,
    finishReason,
    modelId,
    latencyMs: Math.round(performance.now() - start),
    ...(finishReason === 'error' && {
      error: 'Stream finished with error (provider returned invalid response)',
    }),
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  };
}
