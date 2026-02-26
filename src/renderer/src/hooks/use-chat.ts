import type { Event, Permission, SessionStatus } from '@opencode-ai/sdk/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, PendingPermission } from '@/lib/opencode-types';
import {
  addPermission,
  extractSessionError,
  removeMessage,
  removeMessagePart,
  removePermission,
  updateMessage,
  updateMessagePart,
} from '@/lib/sse-message-handlers';
import { accumulateStepFinishStats, extractStepFinishStats } from '@/lib/step-finish-stats';
import type { OpencodeClient } from '../lib/opencode-client-types';

export type { ChatMessage, PendingPermission };

interface UseChatInput {
  client: OpencodeClient | null;
  baseUrl: string | null;
  directory: string;
  systemPrompt: string;
  agentName?: string;
  sessionId: string | null;
  providerId: string;
  modelId: string;
  onFileEdit?: (filePath: string) => void;
  captureFiles?: () => Promise<Record<string, string>>;
  onTurnSnapshot?: (data: {
    files: Record<string, string>;
    assistantMessageId: string;
    promptExcerpt: string;
  }) => void;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  pendingPermissions: PendingPermission[];
  sessionStatus: SessionStatus | null;
  totalCost: number;
  totalTokens: { input: number; output: number; reasoning: number };
  sending: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  replyPermission: (id: string, response: 'once' | 'always' | 'reject') => Promise<void>;
  loadMessages: () => Promise<void>;
  revert: (assistantMessageId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChat({
  client,
  baseUrl,
  directory,
  systemPrompt,
  agentName,
  sessionId,
  providerId,
  modelId,
  onFileEdit,
  captureFiles,
  onTurnSnapshot,
}: UseChatInput): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [revertMessageId, setRevertMessageId] = useState<string | null>(null);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cost accumulators stored in refs, synced to state
  const costRef = useRef(0);
  const tokensRef = useRef({ input: 0, output: 0, reasoning: 0 });
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0, reasoning: 0 });

  // Directory ref to filter SSE events without reconnecting
  const directoryRef = useRef(directory);
  directoryRef.current = directory;

  // Callback refs so changes don't force SSE reconnection
  const onFileEditRef = useRef(onFileEdit);
  onFileEditRef.current = onFileEdit;
  const captureFilesRef = useRef(captureFiles);
  captureFilesRef.current = captureFiles;
  const onTurnSnapshotRef = useRef(onTurnSnapshot);
  onTurnSnapshotRef.current = onTurnSnapshot;

  // Snapshot tracking refs (no state — avoids re-renders)
  const pendingSnapshotFilesRef = useRef<Record<string, string> | null>(null);
  const pendingSnapshotPromptRef = useRef('');
  const fileEditedCountRef = useRef(0);
  const currentAssistantMessageIdRef = useRef<string | null>(null);

  // Reset state when sessionId changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on sessionId change
  useEffect(() => {
    setMessages([]);
    setRevertMessageId(null);
    setPendingPermissions([]);
    setSessionStatus(null);
    setSending(false);
    setError(null);
    costRef.current = 0;
    tokensRef.current = { input: 0, output: 0, reasoning: 0 };
    setTotalCost(0);
    setTotalTokens({ input: 0, output: 0, reasoning: 0 });
    pendingSnapshotFilesRef.current = null;
    fileEditedCountRef.current = 0;
    currentAssistantMessageIdRef.current = null;
  }, [sessionId]);

  // ---- SSE subscription ----

  useEffect(() => {
    if (!baseUrl || !sessionId) return;

    const url = `${baseUrl}/global/event`;
    const es = new EventSource(url);

    es.onerror = (ev) => {
      console.error('[chat] SSE error', ev);
    };

    es.onmessage = (ev) => {
      try {
        const raw = JSON.parse(ev.data) as {
          directory?: string;
          payload: Event;
        };
        const event = raw.payload;
        const eventDir = raw.directory ?? '';

        // Filter by directory
        const configDir = directoryRef.current.trim();
        if (configDir && eventDir && eventDir !== configDir) return;

        switch (event.type) {
          case 'message.part.updated': {
            const { part } = event.properties;
            setMessages((prev) => updateMessagePart(prev, part, { createPlaceholder: true }));
            // Accumulate cost from step-finish parts
            const stats = extractStepFinishStats(part);
            if (stats) {
              costRef.current += stats.cost;
              setTotalCost(costRef.current);
              tokensRef.current.input += stats.tokens.input;
              tokensRef.current.output += stats.tokens.output;
              tokensRef.current.reasoning += stats.tokens.reasoning;
              setTotalTokens({ ...tokensRef.current });
            }
            // Treat completed createPage/deletePage as a document.json edit
            // so the page list refetches automatically
            if (
              part.type === 'tool' &&
              (part.tool === 'createPage' || part.tool === 'deletePage') &&
              part.state.status === 'completed'
            ) {
              fileEditedCountRef.current += 1;
              onFileEditRef.current?.('document.json');
            }
            break;
          }
          case 'message.part.removed': {
            const { messageID, partID } = event.properties;
            setMessages((prev) => removeMessagePart(prev, messageID, partID));
            break;
          }
          case 'message.updated': {
            const { info } = event.properties;
            setMessages((prev) => updateMessage(prev, info));
            // Track the first assistant message of this turn for snapshot
            if (info.role === 'assistant' && !currentAssistantMessageIdRef.current) {
              currentAssistantMessageIdRef.current = info.id;
            }
            break;
          }
          case 'message.removed': {
            const { messageID } = event.properties;
            setMessages((prev) => removeMessage(prev, messageID));
            // If the reverted message is removed, the revert is complete
            setRevertMessageId((prev) => (prev === messageID ? null : prev));
            break;
          }
          case 'session.status': {
            setSessionStatus(event.properties.status);
            if (event.properties.status.type === 'idle') {
              // Write snapshot if this turn edited files
              if (
                fileEditedCountRef.current > 0 &&
                pendingSnapshotFilesRef.current &&
                currentAssistantMessageIdRef.current
              ) {
                onTurnSnapshotRef.current?.({
                  files: pendingSnapshotFilesRef.current,
                  assistantMessageId: currentAssistantMessageIdRef.current,
                  promptExcerpt: pendingSnapshotPromptRef.current,
                });
              }
              pendingSnapshotFilesRef.current = null;
              fileEditedCountRef.current = 0;
              currentAssistantMessageIdRef.current = null;
            }
            break;
          }
          case 'session.updated': {
            // Session info updated — no action needed for chat
            break;
          }
          case 'session.error': {
            const errMsg = extractSessionError(event.properties);
            if (errMsg) setError(errMsg);
            break;
          }
          case 'permission.updated': {
            const permission = event.properties as Permission;
            setPendingPermissions((prev) => addPermission(prev, permission));
            break;
          }
          case 'permission.replied': {
            const { permissionID } = event.properties;
            setPendingPermissions((prev) => removePermission(prev, permissionID));
            break;
          }
          case 'file.edited': {
            fileEditedCountRef.current += 1;
            onFileEditRef.current?.(event.properties.file);
            break;
          }
        }
      } catch {
        /* SSE parse errors are transient — not user-actionable */
      }
    };

    return () => {
      es.close();
    };
  }, [baseUrl, sessionId]);

  // ---- Actions ----

  const loadMessages = useCallback(async () => {
    if (!client || !sessionId) return;
    try {
      const [msgsResult, sessionResult] = await Promise.all([
        client.session.messages({ path: { id: sessionId } }),
        client.session.get({ path: { id: sessionId } }),
      ]);
      if (msgsResult.data) {
        const msgs = msgsResult.data as ChatMessage[];
        setMessages(msgs);
        const stats = accumulateStepFinishStats(msgs);
        costRef.current = stats.cost;
        tokensRef.current = { ...stats.tokens };
        setTotalCost(stats.cost);
        setTotalTokens({ ...stats.tokens });
      }
      // Restore any persisted revert state (survives navigation)
      const session = sessionResult.data as { revert?: { messageID: string } } | undefined;
      setRevertMessageId(session?.revert?.messageID ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }, [client, sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!client || !sessionId || !text.trim()) return;
      setError(null);
      setSending(true);

      // Capture pre-turn file state for snapshotting
      if (captureFilesRef.current) {
        pendingSnapshotFilesRef.current = await captureFilesRef.current();
        pendingSnapshotPromptRef.current = text.trim().slice(0, 100);
      }
      fileEditedCountRef.current = 0;
      currentAssistantMessageIdRef.current = null;

      const body: Record<string, unknown> = {
        parts: [{ type: 'text', text: text.trim() }],
      };
      if (agentName) body.agent = agentName;
      if (systemPrompt.trim()) body.system = systemPrompt.trim();
      if (providerId && modelId) {
        body.model = { providerID: providerId, modelID: modelId };
      }

      const query = directory.trim() ? { directory: directory.trim() } : undefined;
      try {
        const result = await client.session.promptAsync({
          path: { id: sessionId },
          body: body as Parameters<typeof client.session.promptAsync>[0]['body'],
          query,
        });
        if (result.error) {
          const errPayload = result.error;
          const msg =
            typeof errPayload === 'object' && errPayload !== null && 'error' in errPayload
              ? JSON.stringify((errPayload as Record<string, unknown>).error, null, 2)
              : JSON.stringify(errPayload);
          setError(`promptAsync rejected: ${msg}`);
        }
      } catch (err) {
        console.error('[chat] promptAsync threw', err);
        setError(err instanceof Error ? err.message : 'Failed to send message');
      } finally {
        setSending(false);
      }
    },
    [client, sessionId, directory, systemPrompt, agentName, providerId, modelId],
  );

  const abort = useCallback(async () => {
    if (!client || !sessionId) return;
    try {
      await client.session.abort({ path: { id: sessionId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abort');
    }
  }, [client, sessionId]);

  const replyPermission = useCallback(
    async (permissionId: string, response: 'once' | 'always' | 'reject') => {
      if (!client || !sessionId) return;
      setPendingPermissions((prev) =>
        prev.map((p) => (p.permission.id === permissionId ? { ...p, responding: true } : p)),
      );
      try {
        await client.postSessionIdPermissionsPermissionId({
          path: { id: sessionId, permissionID: permissionId },
          body: { response },
        });
        setPendingPermissions((prev) => prev.filter((p) => p.permission.id !== permissionId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reply permission');
        setPendingPermissions((prev) =>
          prev.map((p) => (p.permission.id === permissionId ? { ...p, responding: false } : p)),
        );
      }
    },
    [client, sessionId],
  );

  const revert = useCallback(
    async (assistantMessageId: string) => {
      if (!client || !sessionId) return;
      try {
        const result = await client.session.revert({
          path: { id: sessionId },
          body: { messageID: assistantMessageId },
        });
        const session = result.data as { revert?: { messageID: string } } | undefined;
        setRevertMessageId(session?.revert?.messageID ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revert');
      }
    },
    [client, sessionId],
  );

  // Filter messages: hide everything from the revert point onwards.
  // When cleanup() fires on the next prompt, message.removed SSE events will
  // permanently remove those messages and clear revertMessageId automatically.
  const revertIdx = revertMessageId ? messages.findIndex((m) => m.info.id === revertMessageId) : -1;
  const visibleMessages = revertIdx >= 0 ? messages.slice(0, revertIdx) : messages;

  return {
    messages: visibleMessages,
    pendingPermissions,
    sessionStatus,
    totalCost,
    totalTokens,
    sending,
    error,
    sendMessage,
    abort,
    replyPermission,
    loadMessages,
    revert,
  };
}
