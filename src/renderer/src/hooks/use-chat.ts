import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentContext, StoredMessage } from '../../../shared/types';
import type { StreamingPart, StreamingToolCallPart } from '../components/chat/types';

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

export interface RetryState {
  attempt: number;
  maxAttempts: number;
}

export interface UseChatV2Return {
  messages: StoredMessage[];
  streamingParts: StreamingPart[];
  streamingReasoning: string;
  isStreaming: boolean;
  isLoading: boolean;
  error: string | null;
  retryState: RetryState | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  sendMessage: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  clearConversation: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRY_ATTEMPTS = 5;

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
  const [streamingParts, setStreamingParts] = useState<StreamingPart[]>([]);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accumulated usage across all turns
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  const usageRef = useRef(usage);
  usageRef.current = usage;

  // Retry state
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const retryAttemptRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for streaming accumulation (avoid stale closures)
  const streamingPartsRef = useRef<StreamingPart[]>([]);
  const pendingReasoningRef = useRef('');
  const chatIdRef = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const onToolCompleteRef = useRef(onToolComplete);
  onToolCompleteRef.current = onToolComplete;

  // Stable refs for context (avoid re-subscribing on every render)
  const agentContextRef = useRef(agentContext);
  agentContextRef.current = agentContext;

  // ---------------------------------------------------------------------------
  // Retry helpers
  // ---------------------------------------------------------------------------

  const clearRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryAttemptRef.current = 0;
    setRetryState(null);
  }, []);

  const attemptStart = useCallback(
    async (msgs: StoredMessage[]) => {
      try {
        const { providerId, modelId } = providerModelRef.current!;
        const { chatId } = await window.litho.chat.start({
          providerId,
          modelId,
          messages: msgs,
          agentId,
          agentContext: agentContextRef.current,
        });
        chatIdRef.current = chatId;
        clearRetry();
      } catch (err) {
        const attempt = retryAttemptRef.current + 1;
        if (attempt < MAX_RETRY_ATTEMPTS) {
          retryAttemptRef.current = attempt;
          setRetryState({ attempt, maxAttempts: MAX_RETRY_ATTEMPTS });
          const delay = Math.pow(2, attempt - 1) * 1000;
          retryTimeoutRef.current = setTimeout(() => {
            void attemptStart(messagesRef.current);
          }, delay);
        } else {
          clearRetry();
          setError(err instanceof Error ? err.message : String(err));
          setIsStreaming(false);
        }
      }
    },
    [providerModelRef, agentId, clearRetry],
  );

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
        setMessages(loaded.messages);
        setUsage(loaded.usage);
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
          const parts = streamingPartsRef.current;
          const last = parts[parts.length - 1];
          if (last?.type === 'text') {
            last.text += event.text ?? '';
          } else {
            parts.push({ type: 'text', text: event.text ?? '' });
          }
          setStreamingParts([...parts]);
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
          streamingPartsRef.current.push({
            type: 'tool-call',
            toolCallId: callId,
            toolName: callToolName,
            input: event.input,
            status: 'calling',
          });
          setStreamingParts([...streamingPartsRef.current]);
          break;
        }
        case 'tool-result': {
          const resultCallId = event.toolCallId!;
          const toolPart = streamingPartsRef.current.find(
            (p): p is StreamingToolCallPart =>
              p.type === 'tool-call' && p.toolCallId === resultCallId,
          );
          const toolName = event.toolName ?? toolPart?.toolName ?? 'unknown';
          const args = ((toolPart?.input ?? {}) as Record<string, unknown>);

          if (toolPart) {
            toolPart.status = 'completed';
            toolPart.output = event.output;
          }
          setStreamingParts([...streamingPartsRef.current]);

          if (MUTATING_TOOLS.has(toolName)) {
            onToolCompleteRef.current?.(toolName, args);
          }
          break;
        }
        case 'finish': {
          setIsStreaming(false);
          chatIdRef.current = null;

          // Accumulate usage
          const newUsage = event.usage
            ? {
                inputTokens: usageRef.current.inputTokens + event.usage.inputTokens,
                outputTokens: usageRef.current.outputTokens + event.usage.outputTokens,
                totalTokens:
                  usageRef.current.totalTokens + event.usage.inputTokens + event.usage.outputTokens,
              }
            : usageRef.current;
          usageRef.current = newUsage;
          setUsage(newUsage);

          // Append response messages and persist
          const responseMessages = event.responseMessages ?? [];
          if (responseMessages.length > 0) {
            setMessages((prev) => {
              const updated = [...prev, ...responseMessages];
              void window.litho.conversation.save(workspaceName, documentId, updated, {
                inputTokens: newUsage.inputTokens,
                outputTokens: newUsage.outputTokens,
              });
              return updated;
            });
          }

          // Clear streaming state
          streamingPartsRef.current = [];
          pendingReasoningRef.current = '';
          setStreamingParts([]);
          setStreamingReasoning('');
          break;
        }
        case 'error': {
          chatIdRef.current = null;
          streamingPartsRef.current = [];
          pendingReasoningRef.current = '';
          setStreamingParts([]);
          setStreamingReasoning('');

          // Retry with exponential backoff
          const attempt = retryAttemptRef.current + 1;
          if (attempt < MAX_RETRY_ATTEMPTS) {
            retryAttemptRef.current = attempt;
            setRetryState({ attempt, maxAttempts: MAX_RETRY_ATTEMPTS });
            const delay = Math.pow(2, attempt - 1) * 1000;
            retryTimeoutRef.current = setTimeout(() => {
              void attemptStart(messagesRef.current);
            }, delay);
          } else {
            clearRetry();
            setError(event.error ?? 'Unknown error');
            setIsStreaming(false);
          }
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

      // Reset streaming & retry state
      setError(null);
      clearRetry();
      streamingPartsRef.current = [];
      pendingReasoningRef.current = '';
      setStreamingParts([]);
      setStreamingReasoning('');
      setIsStreaming(true);

      void attemptStart(updatedMessages);
    },
    [isStreaming, messages, attemptStart, clearRetry],
  );

  // ---------------------------------------------------------------------------
  // Abort
  // ---------------------------------------------------------------------------

  const abort = useCallback(async () => {
    clearRetry();
    if (!chatIdRef.current) return;
    try {
      await window.litho.chat.abort(chatIdRef.current);
    } catch {
      // ignore
    }
  }, [clearRetry]);

  // ---------------------------------------------------------------------------
  // Clear conversation
  // ---------------------------------------------------------------------------

  const clearConversation = useCallback(async () => {
    // Abort active stream & retry
    clearRetry();
    if (chatIdRef.current) {
      void window.litho.chat.abort(chatIdRef.current);
      chatIdRef.current = null;
    }

    setMessages([]);
    setStreamingParts([]);
    setStreamingReasoning('');
    setIsStreaming(false);
    setError(null);
    setUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    streamingPartsRef.current = [];
    pendingReasoningRef.current = '';

    if (workspaceName && documentId) {
      await window.litho.conversation.clear(workspaceName, documentId);
    }
  }, [workspaceName, documentId]);

  return {
    messages,
    streamingParts,
    streamingReasoning,
    isStreaming,
    retryState,
    isLoading,
    error,
    usage,
    sendMessage,
    abort,
    clearConversation,
  };
}
