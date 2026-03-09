import { type LanguageModel, type ModelMessage, streamText, type Tool } from 'ai';
import { getActiveWorkspace } from '../../active-workspace-store';
import { renderSystemPrompt, resolveAgentTools } from '../agents/config';
import { parseError } from '../lib/parse-error';
import { createModel, OUTPUT_TOKEN_MAX } from '../providers/create-model';
import { getCredential } from '../providers/credential-store';
import { getModelInfo, getProviderInfo } from '../providers/models-cache';
import type { ChatStartParams } from '../types';
import {
  type ResponseMessage,
  responseToStoredMessages,
  storedToModelMessages,
} from './message-mapping';
import { buildProviderOptions } from './provider-options';
import { type ChatStreamEvent, mapStreamPart } from './stream-events';

// ---------------------------------------------------------------------------
// Active stream registry
// ---------------------------------------------------------------------------

const activeStreams = new Map<string, AbortController>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STEPS = 50;

function isOpencodeProvider(providerId: string): boolean {
  const providerInfo = getProviderInfo(providerId);
  return providerInfo?.internalProvider === 'opencode' || providerId === 'free';
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
        maxRetries: 0,
        ...(isOAuthCodex ? {} : { maxOutputTokens: OUTPUT_TOKEN_MAX }),
        headers: {
          ...(isOAuthCodex
            ? {
                originator: 'opencode',
                'User-Agent': `opencode/litho (${process.platform} ${process.arch})`,
                session_id: chatId,
              }
            : isOpencodeProvider(providerId)
              ? {
                  'x-opencode-project': getActiveWorkspace() ?? 'litho',
                  'x-opencode-session': chatId,
                  'x-opencode-request': crypto.randomUUID(),
                  'x-opencode-client': 'litho',
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
