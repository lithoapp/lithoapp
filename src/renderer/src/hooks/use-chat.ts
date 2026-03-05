import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentContext,
  ChatError,
  ChatErrorType,
  RevertResult,
  StoredMessage,
} from '../../../shared/types';
import type { StreamingPart, StreamingToolCallPart } from '../components/chat/types';

export type { AgentContext };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { ChatError } from '../../../shared/types';

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
  streamingParts: StreamingPart[];
  streamingReasoning: string;
  isStreaming: boolean;
  isLoading: boolean;
  error: ChatError | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    contextWindow?: number;
  };
  sendMessage: (text: string) => Promise<void>;
  revertToMessage: (userMessageId: string) => Promise<void>;
  abortAndRevert: () => Promise<void>;
  retry: () => Promise<void>;
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

function generateMessageId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

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
  const [error, setError] = useState<ChatError | null>(null);

  // Accumulated usage across all turns
  const [usage, setUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    contextWindow: undefined as number | undefined,
  });
  const usageRef = useRef(usage);
  usageRef.current = usage;

  // Store last user message for retry
  const lastUserMessageRef = useRef<string | null>(null);

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
        setUsage({
          ...loaded.usage,
          contextWindow: loaded.usage.contextWindow ?? undefined,
        });
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
  // Start chat request
  // ---------------------------------------------------------------------------

  const startChat = useCallback(
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
      } catch (err) {
        // Error from IPC call itself (not from streaming)
        setError({
          type: 'unknown',
          message: err instanceof Error ? err.message : String(err),
        });
        setIsStreaming(false);
      }
    },
    [providerModelRef, agentId],
  );

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
        usage?: {
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
          contextWindow?: number;
        };
        responseMessages?: StoredMessage[];
        errorType?: ChatErrorType;
        message?: string;
        retryAfter?: number;
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
          const args = (toolPart?.input ?? {}) as Record<string, unknown>;

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
                contextWindow: event.usage.contextWindow,
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
          setIsStreaming(false);

          setError({
            type: event.errorType ?? 'unknown',
            message: event.message ?? 'Unknown error',
            retryAfter: event.retryAfter,
          });
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

      const isKickoff = messages.length === 0;
      const userMessageId = generateMessageId();
      const userMsg: StoredMessage = { role: 'user', id: userMessageId, content: text };

      // Snapshot document state before agent processes this message (skip kickoff)
      if (!isKickoff) {
        await window.litho.snapshot.create(workspaceName, documentId, userMessageId, messages, {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });
      }

      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      // Store for retry
      lastUserMessageRef.current = text;

      // Reset streaming state
      setError(null);
      streamingPartsRef.current = [];
      pendingReasoningRef.current = '';
      setStreamingParts([]);
      setStreamingReasoning('');
      setIsStreaming(true);

      await startChat(updatedMessages);
    },
    [isStreaming, messages, usage, startChat, workspaceName, documentId],
  );

  // ---------------------------------------------------------------------------
  // Revert to before a user message
  // ---------------------------------------------------------------------------

  const revertToMessage = useCallback(
    async (userMessageId: string) => {
      if (isStreaming) return;

      const result = (await window.litho.snapshot.revert(
        workspaceName,
        documentId,
        userMessageId,
      )) as RevertResult;

      setMessages(result.messages);
      setUsage({
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
        contextWindow: undefined,
      });

      setError(null);
      streamingPartsRef.current = [];
      pendingReasoningRef.current = '';
      setStreamingParts([]);
      setStreamingReasoning('');
      lastUserMessageRef.current = null;

      onToolCompleteRef.current?.('__revert__', {});
    },
    [isStreaming, workspaceName, documentId],
  );

  // ---------------------------------------------------------------------------
  // Retry last message
  // ---------------------------------------------------------------------------

  const retry = useCallback(async () => {
    if (!lastUserMessageRef.current || isStreaming) return;

    // The last user message is already in the messages array — just resend as-is
    setError(null);
    streamingPartsRef.current = [];
    pendingReasoningRef.current = '';
    setStreamingParts([]);
    setStreamingReasoning('');
    setIsStreaming(true);

    await startChat(messagesRef.current);
  }, [isStreaming, startChat]);

  // ---------------------------------------------------------------------------
  // Abort and revert to before the last user message
  // ---------------------------------------------------------------------------

  const abortAndRevert = useCallback(async () => {
    const lastUserMsg = [...messagesRef.current].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg?.id) return;

    // Abort the stream and immediately clear streaming state
    if (chatIdRef.current) {
      try {
        await window.litho.chat.abort(chatIdRef.current);
      } catch {
        // ignore
      }
      chatIdRef.current = null;
    }

    setIsStreaming(false);
    streamingPartsRef.current = [];
    pendingReasoningRef.current = '';
    setStreamingParts([]);
    setStreamingReasoning('');

    const result = (await window.litho.snapshot.revert(
      workspaceName,
      documentId,
      lastUserMsg.id,
    )) as RevertResult;

    setMessages(result.messages);
    setUsage({
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
      contextWindow: undefined,
    });
    setError(null);
    lastUserMessageRef.current = null;

    onToolCompleteRef.current?.('__revert__', {});
  }, [workspaceName, documentId]);

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
    setStreamingParts([]);
    setStreamingReasoning('');
    setIsStreaming(false);
    setError(null);
    lastUserMessageRef.current = null;
    setUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0, contextWindow: undefined });
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
    isLoading,
    error,
    usage,
    sendMessage,
    revertToMessage,
    abortAndRevert,
    retry,
    abort,
    clearConversation,
  };
}
