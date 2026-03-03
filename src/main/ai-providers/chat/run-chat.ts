import { type LanguageModel, type ModelMessage, streamText, type Tool } from 'ai';
import { getActiveWorkspace } from '../../active-workspace-store';
import { renderSystemPrompt, resolveAgentTools } from '../agents/config';
import { createModel, OUTPUT_TOKEN_MAX } from '../providers/create-model';
import { getCredential } from '../providers/credential-store';
import { getModelInfo } from '../providers/models-cache';
import type { ChatStartParams } from '../types';
import {
  type ResponseMessage,
  responseToStoredMessages,
  storedToModelMessages,
} from './message-mapping';
import { buildProviderOptions } from './provider-options';
import { type ChatErrorType, type ChatStreamEvent, mapStreamPart } from './stream-events';

// ---------------------------------------------------------------------------
// Active stream registry
// ---------------------------------------------------------------------------

const activeStreams = new Map<string, AbortController>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STEPS = 50;

// ---------------------------------------------------------------------------
// Error parsing
// ---------------------------------------------------------------------------

export interface ParsedError {
  errorType: ChatErrorType;
  message: string;
  retryAfter?: number;
}

interface AISdkError extends Error {
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  data?: { error?: { message?: string; type?: string } };
}

function isAISdkError(err: Error): err is AISdkError {
  return 'statusCode' in err || 'responseHeaders' in err || 'responseBody' in err;
}

export function parseError(err: unknown): ParsedError {
  if (!(err instanceof Error)) {
    return { errorType: 'unknown', message: String(err) };
  }

  const aiErr = isAISdkError(err) ? (err as AISdkError) : null;
  const statusCode = aiErr?.statusCode;
  const responseHeaders = aiErr?.responseHeaders;
  const message = err.message;

  // Extract retry-after header
  let retryAfter: number | undefined;
  if (responseHeaders?.['retry-after']) {
    retryAfter = parseInt(responseHeaders['retry-after'], 10);
    if (isNaN(retryAfter)) retryAfter = undefined;
  }

  // Extract clean message from response body
  let cleanMessage: string | undefined;
  const bodyErrorType = aiErr?.data?.error?.type;

  if (aiErr?.data?.error?.message) {
    cleanMessage = aiErr.data.error.message;
  } else if (aiErr?.responseBody) {
    try {
      const parsed = JSON.parse(aiErr.responseBody);
      if (parsed.error?.message) cleanMessage = parsed.error.message;
      else if (parsed.message) cleanMessage = parsed.message;
    } catch {
      // Not JSON
    }
  }

  // --- Classify by structured error type first (most specific) ---

  // Rate limit (body type or status code)
  if (
    bodyErrorType === 'FreeUsageLimitError' ||
    bodyErrorType === 'UsageLimitExceeded' ||
    statusCode === 429 ||
    message.toLowerCase().includes('rate limit')
  ) {
    return {
      errorType: 'rate_limit',
      message: cleanMessage ?? 'Rate limit exceeded. Please try again later.',
      retryAfter,
    };
  }

  // Model not found / not supported (body type or 404)
  if (bodyErrorType === 'not_found_error' || bodyErrorType === 'ModelError' || statusCode === 404) {
    // Improve cryptic messages like "model: claude-3-5-haiku-latest"
    const modelMatch = (cleanMessage ?? message).match(/model:?\s*(\S+)/i);
    const modelName = modelMatch?.[1];
    const displayMessage = modelName
      ? `Model "${modelName}" is not available. Try a different model.`
      : (cleanMessage ?? 'Model not found. Try a different model.');
    return { errorType: 'unknown', message: displayMessage };
  }

  // If the response body has a specific error type that isn't auth-related,
  // trust it over the HTTP status code. Servers may return 401 for non-auth
  // errors (e.g. other provider-specific errors).
  if (bodyErrorType && cleanMessage) {
    return { errorType: 'unknown', message: cleanMessage };
  }

  // --- Fall back to status code classification ---

  // Auth errors (401)
  if (
    statusCode === 401 ||
    message.includes('401') ||
    message.toLowerCase().includes('unauthorized') ||
    message.toLowerCase().includes('invalid api key')
  ) {
    return {
      errorType: 'auth',
      message: cleanMessage ?? 'Authentication failed. Please reconnect your provider.',
    };
  }

  // Server errors (500, 502, 503, 504)
  if (
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  ) {
    return {
      errorType: 'server',
      message: cleanMessage ?? 'Server error. Please try again.',
    };
  }

  // Network errors
  if (
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('econnrefused') ||
    message.toLowerCase().includes('enotfound') ||
    message.toLowerCase().includes('etimedout') ||
    message.toLowerCase().includes('fetch failed')
  ) {
    return {
      errorType: 'network',
      message: 'Connection failed. Please check your internet.',
    };
  }

  return { errorType: 'unknown', message: cleanMessage ?? extractCleanMessage(message) };
}

function extractCleanMessage(message: string): string {
  // Remove error type prefixes like "AI_APICallError:", "Error:", etc.
  let cleaned = message
    .replace(/^[A-Z_]+Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .replace(/^Failed to fetch:\s*/i, '')
    .replace(/^API error:\s*/i, '');

  // Truncate if too long
  if (cleaned.length > 200) {
    cleaned = cleaned.slice(0, 200) + '…';
  }

  return cleaned || 'An unexpected error occurred.';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type Emit = (channel: string, ...args: unknown[]) => void;

export function startChat(params: ChatStartParams, emit: Emit): string {
  const chatId = crypto.randomUUID();
  const controller = new AbortController();
  activeStreams.set(chatId, controller);

  const model = createModel(params.providerId, params.modelId);
  const cred = getCredential(params.providerId);
  const isOAuthCodex = params.providerId === 'openai' && cred?.type === 'oauth';

  let tools: Record<string, Tool> | undefined;
  let systemPrompt = params.system;

  if (params.agentId) {
    const workspace = getActiveWorkspace();
    if (!workspace) throw new Error('No active workspace');
    tools = resolveAgentTools(params.agentId, workspace);
    if (params.agentContext) {
      systemPrompt = renderSystemPrompt(params.agentId, params.agentContext, params.modelId);
    }
  }

  const modelMessages = storedToModelMessages(params.messages);
  const toolNames = tools ? Object.keys(tools) : [];

  console.log(
    `[chat:start] ${chatId.slice(0, 8)} | ${params.providerId}/${params.modelId} | ` +
      `agent=${params.agentId ?? 'none'} | tools=${toolNames.length} | msgs=${params.messages.length}`,
  );

  void runStepLoop(
    chatId,
    model,
    systemPrompt,
    modelMessages,
    tools,
    isOAuthCodex,
    params.providerId,
    params.modelId,
    controller,
    emit,
  );

  return chatId;
}

export function abortChat(chatId: string): void {
  const controller = activeStreams.get(chatId);
  if (controller) {
    controller.abort();
    activeStreams.delete(chatId);
  }
}

// ---------------------------------------------------------------------------
// Step loop — continues even after text-only responses (like OpenCode)
// ---------------------------------------------------------------------------

async function runStepLoop(
  chatId: string,
  model: LanguageModel,
  systemPrompt: string | undefined,
  initialMessages: ModelMessage[],
  tools: Record<string, Tool> | undefined,
  isOAuthCodex: boolean,
  providerId: string,
  modelId: string,
  controller: AbortController,
  emit: Emit,
): Promise<void> {
  let currentMessages = initialMessages;
  let allResponseMessages: ResponseMessage[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let streamErrorEmitted = false;

  // Get model's context window for progress tracking
  const modelInfo = getModelInfo(providerId, modelId);
  const contextWindow = modelInfo?.contextWindow;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (controller.signal.aborted) break;

      console.log(`  [step ${step + 1}/${MAX_STEPS}]`);

      // Build messages array: system prompt as system-role message (like OpenCode),
      // followed by conversation messages.
      const msgs: ModelMessage[] = [
        ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
        ...currentMessages,
      ];

      // Build provider-specific options (matches OpenCode's ProviderTransform.options)
      // biome-ignore lint/suspicious/noExplicitAny: providerOptions needs wide type
      const extra: Record<string, any> = { promptCacheKey: chatId };
      if (isOAuthCodex && systemPrompt) {
        extra.instructions = systemPrompt;
      }
      const providerOptions = buildProviderOptions(providerId, modelId, extra);

      const result = streamText({
        model,
        messages: msgs,
        abortSignal: controller.signal,
        // OpenCode sets maxRetries to 0 and handles retry at a higher level
        maxRetries: 0,
        // OpenCode caps output at 32K; undefined for Codex
        ...(isOAuthCodex ? {} : { maxOutputTokens: OUTPUT_TOKEN_MAX }),
        headers: {
          ...(isOAuthCodex
            ? {
                originator: 'opencode',
                'User-Agent': `opencode/litho (${process.platform} ${process.arch})`,
                session_id: chatId,
              }
            : {}),
        },
        providerOptions,
        ...(tools ? { tools } : {}),
      });

      // Consume this step's stream
      let hasToolCalls = false;
      let textLength = 0;
      let stepFinishReason = 'unknown';
      let hadStreamError = false;

      for await (const part of result.fullStream) {
        // biome-ignore lint/suspicious/noExplicitAny: stream part is a wide union
        const p = part as any;

        if (p.type === 'text-delta') {
          textLength += (p.text ?? '').length;
        } else if (p.type === 'tool-call') {
          hasToolCalls = true;
          console.log(`    tool-call: ${p.toolName}`);
        } else if (p.type === 'tool-result') {
          console.log(`    tool-result: ${p.toolName}`);
        } else if (p.type === 'finish') {
          stepFinishReason = p.finishReason ?? 'unknown';
          // Replace (not accumulate) input tokens - each step reports full context size
          totalUsage.inputTokens = p.totalUsage?.inputTokens ?? 0;
          totalUsage.outputTokens += p.totalUsage?.outputTokens ?? 0;
        } else if (p.type === 'error') {
          hadStreamError = true;
        }

        // Emit displayable events to renderer (skip finish — we emit our own)
        if (p.type !== 'finish') {
          const event = mapStreamPart(p);
          if (event) {
            emit('chat:delta', chatId, event);
            if (event.type === 'error') streamErrorEmitted = true;
          }
        }
      }

      console.log(`    done — text=${textLength} tools=${hasToolCalls} finish=${stepFinishReason}`);

      // If an in-stream error was emitted, stop the loop — the renderer
      // already received the error event.
      if (hadStreamError) return;

      // Collect response messages from this step
      const response = await result.response;
      const stepMessages = response.messages as ResponseMessage[];
      allResponseMessages = [...allResponseMessages, ...stepMessages];

      // Decide whether to continue (matches OpenCode: only continue on tool-calls/unknown)
      if (!hasToolCalls) break;

      currentMessages = [...currentMessages, ...(stepMessages as ModelMessage[])];
    }

    // Emit final finish with all accumulated response messages
    const responseMessages = responseToStoredMessages(allResponseMessages);

    emit('chat:delta', chatId, {
      type: 'finish',
      finishReason: 'stop',
      usage: {
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
        totalTokens: totalUsage.inputTokens + totalUsage.outputTokens,
        contextWindow,
      },
      responseMessages,
    } satisfies ChatStreamEvent);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      emit('chat:delta', chatId, {
        type: 'finish',
        finishReason: 'abort',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, contextWindow },
        responseMessages: responseToStoredMessages(allResponseMessages),
      } satisfies ChatStreamEvent);
      return;
    }
    // Only emit if we haven't already emitted an in-stream error
    if (!streamErrorEmitted) {
      const parsed = parseError(err);
      emit('chat:delta', chatId, {
        type: 'error',
        ...parsed,
      } satisfies ChatStreamEvent);
    }
  } finally {
    activeStreams.delete(chatId);
  }
}
