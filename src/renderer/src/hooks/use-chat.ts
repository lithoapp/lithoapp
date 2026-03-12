import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentContext,
  ChatError,
  ChatErrorType,
  RevertResult,
  StoredAssistantMessage,
  StoredMessage,
  StoredUserMessage,
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
  agentId: 'document' | 'design-system' | 'workspace';
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
    /** Cumulative cost: sum of all turns' input tokens */
    costInputTokens: number;
    /** Cumulative cost: sum of all turns' output tokens */
    costOutputTokens: number;
    /** Context: last turn's total tokens (how full the context window is) */
    contextTokens: number;
    contextWindow?: number;
  };
  sendMessage: (text: string) => Promise<void>;
  revertToMessage: (userMessageId: string) => Promise<string | null>;
  abortAndRevert: () => Promise<string | null>;
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
  'createDocument',
  'deleteDocument',
  'renameDocument',
  'moveDocumentToFolder',
  'duplicateDocument',
  'updateDocumentDescription',
]);

function generateMessageId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Compute cumulative cost from per-message usage data on assistant messages. */
function computeCumulativeCost(messages: StoredMessage[]): {
  inputTokens: number;
  outputTokens: number;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const u = (msg as StoredAssistantMessage).usage;
      if (u) {
        inputTokens += u.inputTokens;
        outputTokens += u.outputTokens;
      }
    }
  }
  return { inputTokens, outputTokens };
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

  // Usage: cumulative cost + current context depth
  const [usage, setUsage] = useState({
    costInputTokens: 0,
    costOutputTokens: 0,
    contextTokens: 0,
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

        // Recompute cost from per-message usage if available, otherwise fall back to DB values
        const perMessageCost = computeCumulativeCost(loaded.messages);
        const hasPerMessageUsage =
          perMessageCost.inputTokens > 0 || perMessageCost.outputTokens > 0;
        const costInput = hasPerMessageUsage
          ? perMessageCost.inputTokens
          : loaded.usage.inputTokens;
        const costOutput = hasPerMessageUsage
          ? perMessageCost.outputTokens
          : loaded.usage.outputTokens;

        setUsage({
          costInputTokens: costInput,
          costOutputTokens: costOutput,
          contextTokens: 0, // no active turn on load
          contextWindow: undefined,
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
        const providerModel = providerModelRef.current;
        if (!providerModel) {
          throw new Error('Provider/model not selected');
        }
        const { providerId, modelId } = providerModel;
        const { chatId } = await window.litho.chat.start({
          providerId,
          modelId,
          messages: msgs,
          agentId,
          agentContext: agentContextRef.current,
          workspaceName,
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
    [providerModelRef, agentId, workspaceName],
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
          const rParts = streamingPartsRef.current;
          const rLast = rParts[rParts.length - 1];
          if (rLast?.type === 'reasoning') {
            rLast.text += event.text ?? '';
          } else {
            rParts.push({ type: 'reasoning', text: event.text ?? '' });
          }
          setStreamingParts([...rParts]);
          break;
        }
        case 'tool-call': {
          if (!event.toolCallId || !event.toolName) break;
          streamingPartsRef.current.push({
            type: 'tool-call',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
            status: 'calling',
          });
          setStreamingParts([...streamingPartsRef.current]);
          break;
        }
        case 'tool-result': {
          if (!event.toolCallId) break;
          const toolPart = streamingPartsRef.current.find(
            (p): p is StreamingToolCallPart =>
              p.type === 'tool-call' && p.toolCallId === event.toolCallId,
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

          // Append response messages (which carry per-message usage) and recompute
          const responseMessages = event.responseMessages ?? [];
          if (responseMessages.length > 0) {
            setMessages((prev) => {
              const updated = [...prev, ...responseMessages];

              // Cumulative cost: sum all assistant messages' per-turn usage
              const cost = computeCumulativeCost(updated);

              const newUsage = {
                costInputTokens: cost.inputTokens,
                costOutputTokens: cost.outputTokens,
                // Context: this turn's input tokens = how full the context window is
                contextTokens: event.usage?.inputTokens ?? 0,
                contextWindow: event.usage?.contextWindow,
              };
              usageRef.current = newUsage;
              setUsage(newUsage);

              void window.litho.conversation.save(workspaceName, documentId, updated, {
                inputTokens: cost.inputTokens,
                outputTokens: cost.outputTokens,
              });
              return updated;
            });
          } else {
            // No response messages (e.g. abort before any tool calls).
            // Still save the conversation to persist the user message.
            setMessages((prev) => {
              const cost = computeCumulativeCost(prev);
              void window.litho.conversation.save(workspaceName, documentId, prev, {
                inputTokens: cost.inputTokens,
                outputTokens: cost.outputTokens,
              });
              return prev;
            });

            if (event.usage) {
              const newUsage = {
                ...usageRef.current,
                contextTokens: event.usage.inputTokens,
                contextWindow: event.usage.contextWindow,
              };
              usageRef.current = newUsage;
              setUsage(newUsage);
            }
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
          inputTokens: usage.costInputTokens,
          outputTokens: usage.costOutputTokens,
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
      if (isStreaming) return null;

      const userMsg = messagesRef.current.find(
        (m): m is StoredUserMessage => m.role === 'user' && m.id === userMessageId,
      );
      const userPrompt = userMsg?.content ?? null;

      const result = (await window.litho.snapshot.revert(
        workspaceName,
        documentId,
        userMessageId,
      )) as RevertResult;

      setMessages(result.messages);

      // Recompute cost from per-message usage after revert
      const cost = computeCumulativeCost(result.messages);
      const hasPerMessage = cost.inputTokens > 0 || cost.outputTokens > 0;
      setUsage({
        costInputTokens: hasPerMessage ? cost.inputTokens : result.usage.inputTokens,
        costOutputTokens: hasPerMessage ? cost.outputTokens : result.usage.outputTokens,
        contextTokens: 0,
        contextWindow: undefined,
      });

      setError(null);
      streamingPartsRef.current = [];
      pendingReasoningRef.current = '';
      setStreamingParts([]);
      setStreamingReasoning('');
      lastUserMessageRef.current = null;

      onToolCompleteRef.current?.('__revert__', {});

      return userPrompt;
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
    if (!lastUserMsg?.id) return null;

    const userPrompt = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : null;

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

    // Recompute cost from per-message usage after revert
    const cost = computeCumulativeCost(result.messages);
    const hasPerMessage = cost.inputTokens > 0 || cost.outputTokens > 0;
    setUsage({
      costInputTokens: hasPerMessage ? cost.inputTokens : result.usage.inputTokens,
      costOutputTokens: hasPerMessage ? cost.outputTokens : result.usage.outputTokens,
      contextTokens: 0,
      contextWindow: undefined,
    });
    setError(null);
    lastUserMessageRef.current = null;

    onToolCompleteRef.current?.('__revert__', {});

    return userPrompt;
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
    setUsage({
      costInputTokens: 0,
      costOutputTokens: 0,
      contextTokens: 0,
      contextWindow: undefined,
    });
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
