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
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  pendingPermissions: PendingPermission[];
  sessionStatus: SessionStatus | null;
  totalCost: number;
  totalTokens: { input: number; output: number; reasoning: number };
  sending: boolean;
  isAborting: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  replyPermission: (id: string, response: 'once' | 'always' | 'reject') => Promise<void>;
  loadMessages: () => Promise<void>;
}

export function useChat({
  client,
  baseUrl,
  directory,
  systemPrompt,
  agentName,
  sessionId,
  providerId,
  modelId,
  onToolComplete,
}: UseChatInput): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costRef = useRef(0);
  const tokensRef = useRef({ input: 0, output: 0, reasoning: 0 });
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0, reasoning: 0 });

  const directoryRef = useRef(directory);
  directoryRef.current = directory;

  const onToolCompleteRef = useRef(onToolComplete);
  onToolCompleteRef.current = onToolComplete;

  // Reset state when sessionId changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on sessionId change
  useEffect(() => {
    setMessages([]);
    setPendingPermissions([]);
    setSessionStatus(null);
    setSending(false);
    setError(null);
    costRef.current = 0;
    tokensRef.current = { input: 0, output: 0, reasoning: 0 };
    setTotalCost(0);
    setTotalTokens({ input: 0, output: 0, reasoning: 0 });
  }, [sessionId]);

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

        const configDir = directoryRef.current.trim();
        if (configDir && eventDir && eventDir !== configDir) return;

        switch (event.type) {
          case 'message.part.updated': {
            const { part } = event.properties;
            setMessages((prev) => updateMessagePart(prev, part, { createPlaceholder: true }));
            const stats = extractStepFinishStats(part);
            if (stats) {
              costRef.current += stats.cost;
              setTotalCost(costRef.current);
              tokensRef.current.input += stats.tokens.input;
              tokensRef.current.output += stats.tokens.output;
              tokensRef.current.reasoning += stats.tokens.reasoning;
              setTotalTokens({ ...tokensRef.current });
            }
            if (part.type === 'tool' && part.state.status === 'completed') {
              const mutatingTools = [
                'writePage',
                'editPage',
                'createPage',
                'deletePage',
                'updatePageDetails',
                'movePage',
                'writeMainCss',
                'editMainCss',
              ];
              if (mutatingTools.includes(part.tool)) {
                onToolCompleteRef.current?.(
                  part.tool,
                  (part.state.input as Record<string, unknown>) ?? {},
                );
              }
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
            break;
          }
          case 'message.removed': {
            const { messageID } = event.properties;
            setMessages((prev) => removeMessage(prev, messageID));
            break;
          }
          case 'session.status': {
            setSessionStatus(event.properties.status);
            break;
          }
          case 'session.updated': {
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
        }
      } catch {
        /* SSE parse errors are transient — not user-actionable */
      }
    };

    return () => {
      es.close();
    };
  }, [baseUrl, sessionId]);

  const loadMessages = useCallback(async () => {
    if (!client || !sessionId) return;
    try {
      const msgsResult = await client.session.messages({ path: { id: sessionId } });
      if (msgsResult.data) {
        const msgs = msgsResult.data as ChatMessage[];
        setMessages(msgs);
        const stats = accumulateStepFinishStats(msgs);
        costRef.current = stats.cost;
        tokensRef.current = { ...stats.tokens };
        setTotalCost(stats.cost);
        setTotalTokens({ ...stats.tokens });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }, [client, sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!client || !sessionId || !text.trim()) return;
      setError(null);
      setSending(true);

      const body: Record<string, unknown> = {
        parts: [{ type: 'text', text: text.trim() }],
      };
      if (agentName) body.agent = agentName;
      if (systemPrompt.trim()) body.system = systemPrompt.trim();
      if (providerId && modelId) {
        body.model = { providerID: providerId, modelID: modelId };
      }

      const dir = directory.trim();
      const query = dir ? { directory: dir } : undefined;
      const headers = dir ? { 'x-opencode-directory': encodeURIComponent(dir) } : undefined;
      try {
        const result = await client.session.promptAsync({
          path: { id: sessionId },
          body: body as Parameters<typeof client.session.promptAsync>[0]['body'],
          query,
          headers,
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
    setIsAborting(true);
    const dir = directory.trim();
    const query = dir ? { directory: dir } : undefined;
    const headers = dir ? { 'x-opencode-directory': encodeURIComponent(dir) } : undefined;
    try {
      await client.session.abort({ path: { id: sessionId }, query, headers });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to abort');
    } finally {
      setIsAborting(false);
    }
  }, [client, sessionId, directory]);

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

  return {
    messages,
    pendingPermissions,
    sessionStatus,
    totalCost,
    totalTokens,
    sending,
    isAborting,
    error,
    sendMessage,
    abort,
    replyPermission,
    loadMessages,
  };
}
