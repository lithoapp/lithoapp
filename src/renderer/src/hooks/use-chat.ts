import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentContext, StoredMessage } from '../../../shared/types';
import type { StreamingToolCall } from '../components/chat/types';

export type { AgentContext };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseChatV2Input {
  workspaceName: string;
  documentId: string;
  agentId: 'document' | 'design-system';
  agentContext: AgentContext;
  providerModelRef: React.RefObject<{ providerId: string; modelId: string }>;
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
}

export interface UseChatV2Return {
  messages: StoredMessage[];
  streamingText: string;
  streamingReasoning: string;
  streamingToolCalls: StreamingToolCall[];
  isStreaming: boolean;
  isLoading: boolean;
  error: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  sendMessage: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  clearConversation: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MUTATING_TOOLS = new Set([
  'writePage',
  'editPage',
  'createPage',
  'deletePage',
  'updatePageDetails',
  'movePage',
  'writeMainCss',
  'editMainCss',
]);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatV2({
  workspaceName,
  documentId,
  agentId,
  agentContext,
  providerModelRef,
  onToolComplete,
}: UseChatV2Input): UseChatV2Return {
  // Persisted messages (source of truth)
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Streaming state (transient, reset each turn)
  const [streamingText, setStreamingText] = useState('');
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<StreamingToolCall[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accumulated usage across all turns
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });

  // Refs for streaming accumulation (avoid stale closures)
  const pendingTextRef = useRef('');
  const pendingReasoningRef = useRef('');
  const toolCallArgsRef = useRef(new Map<string, { toolName: string; input: unknown }>());
  const chatIdRef = useRef<string | null>(null);
  const onToolCompleteRef = useRef(onToolComplete);
  onToolCompleteRef.current = onToolComplete;

  // Stable refs for context (avoid re-subscribing on every render)
  const agentContextRef = useRef(agentContext);
  agentContextRef.current = agentContext;

  // ---------------------------------------------------------------------------
  // Load conversation from DB
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!workspaceName || !documentId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void (async () => {
      try {
        const loaded = await window.litho.conversation.load(workspaceName, documentId);
        setMessages(loaded);
      } catch {
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    })();

    // Abort active stream when document changes
    return () => {
      if (chatIdRef.current) {
        void window.litho.chat.abort(chatIdRef.current);
        chatIdRef.current = null;
      }
    };
  }, [workspaceName, documentId]);

  // ---------------------------------------------------------------------------
  // Event subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = window.litho.chat.onDelta((id, data) => {
      if (id !== chatIdRef.current) return;

      const event = data as {
        type: string;
        text?: string;
        toolCallId?: string;
        toolName?: string;
        input?: unknown;
        output?: unknown;
        finishReason?: string;
        usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
        responseMessages?: StoredMessage[];
        error?: string;
      };

      switch (event.type) {
        case 'text-delta': {
          pendingTextRef.current += event.text ?? '';
          setStreamingText(pendingTextRef.current);
          break;
        }
        case 'reasoning-delta': {
          pendingReasoningRef.current += event.text ?? '';
          setStreamingReasoning(pendingReasoningRef.current);
          break;
        }
        case 'tool-call': {
          const callId = event.toolCallId!;
          const callToolName = event.toolName!;
          toolCallArgsRef.current.set(callId, { toolName: callToolName, input: event.input });
          setStreamingToolCalls((prev) => [
            ...prev,
            {
              toolCallId: callId,
              toolName: callToolName,
              input: event.input,
              status: 'calling',
            },
          ]);
          break;
        }
        case 'tool-result': {
          const resultCallId = event.toolCallId!;
          const tracked = toolCallArgsRef.current.get(resultCallId);
          const toolName = event.toolName ?? tracked?.toolName ?? 'unknown';
          const args = (tracked?.input ?? {}) as Record<string, unknown>;

          setStreamingToolCalls((prev) =>
            prev.map((tc) =>
              tc.toolCallId === event.toolCallId
                ? { ...tc, status: 'completed' as const, output: event.output }
                : tc,
            ),
          );

          if (MUTATING_TOOLS.has(toolName)) {
            onToolCompleteRef.current?.(toolName, args);
          }
          break;
        }
        case 'finish': {
          setIsStreaming(false);
          chatIdRef.current = null;

          // Accumulate usage
          if (event.usage) {
            setUsage((prev) => ({
              inputTokens: prev.inputTokens + event.usage!.inputTokens,
              outputTokens: prev.outputTokens + event.usage!.outputTokens,
              totalTokens: prev.totalTokens + event.usage!.totalTokens,
            }));
          }

          // Append response messages and persist
          const responseMessages = event.responseMessages ?? [];
          if (responseMessages.length > 0) {
            setMessages((prev) => {
              const updated = [...prev, ...responseMessages];
              void window.litho.conversation.save(workspaceName, documentId, updated);
              return updated;
            });
          }

          // Clear streaming state
          pendingTextRef.current = '';
          pendingReasoningRef.current = '';
          toolCallArgsRef.current.clear();
          setStreamingText('');
          setStreamingReasoning('');
          setStreamingToolCalls([]);
          break;
        }
        case 'error': {
          setError(event.error ?? 'Unknown error');
          setIsStreaming(false);
          chatIdRef.current = null;
          pendingTextRef.current = '';
          pendingReasoningRef.current = '';
          toolCallArgsRef.current.clear();
          setStreamingText('');
          setStreamingReasoning('');
          setStreamingToolCalls([]);
          break;
        }
      }
    });

    return cleanup;
  }, [workspaceName, documentId]);

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      const userMsg: StoredMessage = { role: 'user', content: text };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      // Reset streaming state
      setError(null);
      pendingTextRef.current = '';
      pendingReasoningRef.current = '';
      toolCallArgsRef.current.clear();
      setStreamingText('');
      setStreamingReasoning('');
      setStreamingToolCalls([]);
      setIsStreaming(true);

      try {
        const { providerId, modelId } = providerModelRef.current!;
        const { chatId } = await window.litho.chat.start({
          providerId,
          modelId,
          messages: updatedMessages,
          agentId,
          agentContext: agentContextRef.current,
        });
        chatIdRef.current = chatId;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsStreaming(false);
      }
    },
    [isStreaming, messages, providerModelRef, agentId],
  );

  // ---------------------------------------------------------------------------
  // Abort
  // ---------------------------------------------------------------------------

  const abort = useCallback(async () => {
    if (!chatIdRef.current) return;
    try {
      await window.litho.chat.abort(chatIdRef.current);
    } catch {
      // ignore
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Clear conversation
  // ---------------------------------------------------------------------------

  const clearConversation = useCallback(async () => {
    // Abort active stream
    if (chatIdRef.current) {
      void window.litho.chat.abort(chatIdRef.current);
      chatIdRef.current = null;
    }

    setMessages([]);
    setStreamingText('');
    setStreamingReasoning('');
    setStreamingToolCalls([]);
    setIsStreaming(false);
    setError(null);
    setUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    pendingTextRef.current = '';
    pendingReasoningRef.current = '';
    toolCallArgsRef.current.clear();

    if (workspaceName && documentId) {
      await window.litho.conversation.clear(workspaceName, documentId);
    }
  }, [workspaceName, documentId]);

  return {
    messages,
    streamingText,
    streamingReasoning,
    streamingToolCalls,
    isStreaming,
    isLoading,
    error,
    usage,
    sendMessage,
    abort,
    clearConversation,
  };
}
