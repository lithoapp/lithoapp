import { type LanguageModel, type ModelMessage, streamText, type Tool } from 'ai';
import { getActiveWorkspace } from '../../active-workspace-store';
import { renderSystemPrompt, resolveAgentTools } from '../agents/config';
import { createModel } from '../providers/create-model';
import type { ChatStartParams } from '../types';
import {
  type ResponseMessage,
  responseToStoredMessages,
  storedToModelMessages,
} from './message-mapping';
import { type ChatStreamEvent, mapStreamPart } from './stream-events';

// ---------------------------------------------------------------------------
// Active stream registry
// ---------------------------------------------------------------------------

const activeStreams = new Map<string, AbortController>();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STEPS = 25;
const MAX_TEXT_ONLY_STEPS = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

type Emit = (channel: string, ...args: unknown[]) => void;

export function startChat(params: ChatStartParams, emit: Emit): string {
  const chatId = crypto.randomUUID();
  const controller = new AbortController();
  activeStreams.set(chatId, controller);

  const model = createModel(params.providerId, params.modelId);

  let tools: Record<string, Tool> | undefined;
  let systemPrompt = params.system;

  if (params.agentId) {
    const workspace = getActiveWorkspace();
    if (!workspace) throw new Error('No active workspace');
    tools = resolveAgentTools(params.agentId, workspace);
    if (params.agentContext) {
      systemPrompt = renderSystemPrompt(params.agentId, params.agentContext);
    }
  }

  const modelMessages = storedToModelMessages(params.messages);
  const toolNames = tools ? Object.keys(tools) : [];

  console.log(
    `[chat:start] ${chatId.slice(0, 8)} | ${params.providerId}/${params.modelId} | ` +
      `agent=${params.agentId ?? 'none'} | tools=${toolNames.length} | msgs=${params.messages.length}`,
  );

  void runStepLoop(chatId, model, systemPrompt, modelMessages, tools, controller, emit);

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
  controller: AbortController,
  emit: Emit,
): Promise<void> {
  let currentMessages = initialMessages;
  let allResponseMessages: ResponseMessage[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let consecutiveTextOnlySteps = 0;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (controller.signal.aborted) break;

      console.log(`  [step ${step + 1}/${MAX_STEPS}]`);

      const result = streamText({
        model,
        system: systemPrompt,
        messages: currentMessages,
        abortSignal: controller.signal,
        providerOptions: { openai: { store: false } },
        ...(tools ? { tools } : {}),
      });

      // Consume this step's stream
      let hasToolCalls = false;
      let textLength = 0;
      let stepFinishReason = 'unknown';

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
          totalUsage.inputTokens += p.totalUsage?.inputTokens ?? 0;
          totalUsage.outputTokens += p.totalUsage?.outputTokens ?? 0;
        }

        // Emit displayable events to renderer (skip finish — we emit our own)
        if (p.type !== 'finish') {
          const event = mapStreamPart(p);
          if (event) {
            emit('chat:delta', chatId, event);
          }
        }
      }

      console.log(`    done — text=${textLength} tools=${hasToolCalls} finish=${stepFinishReason}`);

      // Collect response messages from this step
      const response = await result.response;
      const stepMessages = response.messages as ResponseMessage[];
      allResponseMessages = [...allResponseMessages, ...stepMessages];

      // Decide whether to continue
      if (hasToolCalls) {
        currentMessages = [...currentMessages, ...(stepMessages as ModelMessage[])];
        consecutiveTextOnlySteps = 0;
        continue;
      }

      // Text-only response
      consecutiveTextOnlySteps++;

      if (!tools || consecutiveTextOnlySteps >= MAX_TEXT_ONLY_STEPS) {
        break;
      }

      currentMessages = [...currentMessages, ...(stepMessages as ModelMessage[])];
      console.log(`    continuing (text-only ${consecutiveTextOnlySteps}/${MAX_TEXT_ONLY_STEPS})`);
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
      },
      responseMessages,
    } satisfies ChatStreamEvent);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      emit('chat:delta', chatId, {
        type: 'finish',
        finishReason: 'abort',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        responseMessages: responseToStoredMessages(allResponseMessages),
      } satisfies ChatStreamEvent);
      return;
    }
    emit('chat:delta', chatId, {
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    } satisfies ChatStreamEvent);
  } finally {
    activeStreams.delete(chatId);
  }
}
