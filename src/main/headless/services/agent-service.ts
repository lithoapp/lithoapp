import type {
  AgentContext,
  AgentId,
  StoredMessage,
  StoredUserMessage,
} from '../../../shared/types';
import { renderKickoff } from '../../ai-providers/agents/config';
import { abortChat, startChat } from '../../ai-providers/chat/run-chat';
import type { ChatStreamEvent } from '../../ai-providers/chat/stream-events';
import { getDesignSystemDocId, loadConversation, readDocumentConfig } from '../../workspace-data';
import { getWorkspaceEntry } from '../../workspace-data/registry-db';
import { assertWorkspaceNameSafe } from '../../workspace-paths';
import type { Dispatcher } from '../json-rpc';

interface ActiveRun {
  runId: string;
  chatId: string;
}

const activeRuns = new Map<string, ActiveRun>();

export interface AgentRunParams {
  workspaceId: string;
  documentId?: string;
  agentId: AgentId;
  modelId: string;
  providerId: string;
  userMessage: string;
  agentContextOverrides?: Partial<AgentContext>;
}

/**
 * Build an AgentContext from workspace/document state. Mirrors the
 * renderer-side logic in src/renderer/src/lib/chat-prompt.ts but runs
 * entirely in the main process for headless use.
 */
async function buildAgentContext(
  workspaceId: string,
  documentId: string | undefined,
): Promise<AgentContext> {
  const entry = getWorkspaceEntry(workspaceId);
  if (!entry) throw new Error(`Workspace "${workspaceId}" not found`);

  const designSystemDocId = (await getDesignSystemDocId(workspaceId)) ?? '';

  if (!documentId) {
    return {
      docId: '',
      title: '',
      workspaceTitle: entry.title,
      width: 0,
      height: 0,
      unit: 'mm',
      userName: '',
      designSystemDocId,
    };
  }

  const config = await readDocumentConfig(workspaceId, documentId);
  return {
    docId: documentId,
    title: config.title,
    workspaceTitle: entry.title,
    width: config.size.width,
    height: config.size.height,
    unit: config.size.unit,
    userName: '',
    designSystemDocId,
  };
}

export function createAgentService(dispatcher: Dispatcher) {
  return {
    async run(params: AgentRunParams): Promise<{ runId: string }> {
      assertWorkspaceNameSafe(params.workspaceId);
      const runId = crypto.randomUUID();

      // Build agent context and apply overrides.
      const baseContext = await buildAgentContext(params.workspaceId, params.documentId);
      const agentContext: AgentContext = { ...baseContext, ...params.agentContextOverrides };

      // Render the kickoff message from the template. Headless runs always
      // include the rendered kickoff in run-start so litho-lab can replay
      // the full conversation faithfully.
      const kickoffMessage = renderKickoff(params.agentId, agentContext);

      // Build initial conversation: existing persisted messages + kickoff (as a
      // hidden first user turn, matching the in-app behavior) + the current
      // user message.
      const existing: StoredMessage[] = params.documentId
        ? (await loadConversation(params.workspaceId, params.documentId)).messages
        : [];

      const kickoffTurn: StoredUserMessage = { role: 'user', content: kickoffMessage };
      const userTurn: StoredUserMessage = { role: 'user', content: params.userMessage };

      const messages: StoredMessage[] =
        existing.length === 0 ? [kickoffTurn, userTurn] : [...existing, userTurn];

      // The *new* input for this turn — what litho-lab cares about for
      // persistence. On the first turn that's [kickoff, user]; on subsequent
      // turns only [user], because kickoff+prior history already flowed
      // through earlier run.finish notifications.
      const turnInputMessages: StoredMessage[] =
        existing.length === 0 ? [kickoffTurn, userTurn] : [userTurn];

      // Wire the chat emit callback to JSON-RPC notifications. startChat's
      // emit signature is (channel, ...args) where args are (chatId, event).
      const emit = (_channel: string, ...args: unknown[]) => {
        const event = args[1] as ChatStreamEvent;
        switch (event.type) {
          case 'run-start':
            dispatcher.notify('run.start', {
              runId,
              agentId: event.agentId,
              modelId: event.modelId,
              providerId: event.providerId,
              systemPromptRendered: event.systemPromptRendered,
              kickoffPromptRendered: event.kickoffPromptRendered,
              agentContext: event.agentContext,
              userMessage: event.userMessage,
              startedAt: event.startedAt,
            });
            break;
          case 'text-delta':
            dispatcher.notify('run.textDelta', { runId, text: event.text });
            break;
          case 'reasoning-delta':
            dispatcher.notify('run.reasoningDelta', { runId, text: event.text });
            break;
          case 'tool-call':
            dispatcher.notify('run.toolCall', {
              runId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.input,
            });
            break;
          case 'tool-result':
            dispatcher.notify('run.toolResult', {
              runId,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              output: event.output,
            });
            break;
          case 'step-usage':
            dispatcher.notify('run.stepUsage', {
              runId,
              step: event.step,
              usage: event.usage,
            });
            break;
          case 'finish': {
            const startedAt = startedAtMap.get(runId);
            const durationMs = startedAt ? Date.now() - startedAt : 0;
            // Emit the full turn: input messages the agent saw for this turn
            // (kickoff on the first turn, user message always) followed by
            // the assistant/tool output. This matches the protocol doc's
            // "canonical conversation history" claim so consumers can
            // persist `messages` as-is.
            dispatcher.notify('run.finish', {
              runId,
              finishReason: event.finishReason,
              totalUsage: event.usage,
              durationMs,
              messages: [...turnInputMessages, ...event.responseMessages],
            });
            activeRuns.delete(runId);
            startedAtMap.delete(runId);
            break;
          }
          case 'error':
            dispatcher.notify('run.error', {
              runId,
              error: { type: event.errorType, message: event.message },
            });
            activeRuns.delete(runId);
            startedAtMap.delete(runId);
            break;
          default:
            // source, etc. — ignore for now
            break;
        }
      };

      startedAtMap.set(runId, Date.now());

      const chatId = startChat(
        {
          providerId: params.providerId,
          modelId: params.modelId,
          messages,
          agentId: params.agentId,
          agentContext,
          workspaceName: params.workspaceId,
          kickoffMessage,
          userMessage: params.userMessage,
        },
        emit,
      );

      activeRuns.set(runId, { runId, chatId });

      return { runId };
    },

    abort(params: { runId: string }): Record<string, never> {
      const run = activeRuns.get(params.runId);
      if (run) {
        abortChat(run.chatId);
        activeRuns.delete(params.runId);
      }
      return {};
    },
  };
}

const startedAtMap = new Map<string, number>();
