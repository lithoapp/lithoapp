import { Loader2, MessageSquare, Send, Square, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { AgentContext, AgentId, StoredMessage } from '../../../../shared/types';

// ---------------------------------------------------------------------------
// Types (mirror preload types)
// ---------------------------------------------------------------------------

interface ProviderInfo {
  id: string;
  name: string;
  modelCount: number;
}

interface ModelInfo {
  id: string;
  name: string;
}

interface DocumentInfo {
  id: string;
  title: string;
  type: 'normal' | 'design-system';
  size: { width: number; height: number; unit: string };
}

type ChatStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'source'; source: unknown }
  | { type: 'error'; error: string }
  | {
      type: 'finish';
      finishReason: string;
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      responseMessages: StoredMessage[];
    };

interface TimestampedEvent {
  ts: number;
  event: ChatStreamEvent;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDisplayMessages(stored: StoredMessage[]): ConversationMessage[] {
  return stored
    .filter(
      (m): m is StoredMessage & { role: 'user' | 'assistant' } =>
        m.role === 'user' || m.role === 'assistant',
    )
    .map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content
              .filter((p) => p.type === 'text')
              .map((p) => (p as { text: string }).text)
              .join(''),
    }))
    .filter((m) => m.content.length > 0);
}

// ---------------------------------------------------------------------------
// Agent context display
// ---------------------------------------------------------------------------

function AgentContextPanel({
  context,
}: {
  context: AgentContext | null;
}): React.JSX.Element | null {
  if (!context) return null;

  const entries: Array<[string, string]> = [
    ['docId', context.docId],
    ['title', context.title ?? '—'],
    ['width', String(context.width ?? '—')],
    ['height', String(context.height ?? '—')],
    ['unit', context.unit ?? '—'],
    ['userName', context.userName ?? '—'],
    ['designSystemDocId', context.designSystemDocId ?? '—'],
    ['fontContext', context.fontContext ? `${context.fontContext.split('\n').length} lines` : '—'],
    [
      'assetsSummary',
      context.assetsSummary &&
      context.assetsSummary !== 'Assets: @assets/... (workspace-level assets)'
        ? `${context.assetsSummary.split('\n').length} lines`
        : '—',
    ],
  ];

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Agent Context (sent with request)
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
            <span className="truncate font-mono text-[11px]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function DebugChatPage(): React.JSX.Element {
  // Provider / model selection
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Agent selection
  const [selectedAgent, setSelectedAgent] = useState<AgentId | 'none'>('none');
  const [selectedDocId, setSelectedDocId] = useState('');

  // Workspace + documents
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);

  // Resolved agent context
  const [userName, setUserName] = useState('');
  const [fontContext, setFontContext] = useState('');
  const [assetsSummary, setAssetsSummary] = useState(
    'Assets: @assets/... (workspace-level assets)',
  );
  const [designSystemDocId, setDesignSystemDocId] = useState<string | null>(null);

  // Inputs
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [showSystem, setShowSystem] = useState(false);
  const [userMessage, setUserMessage] = useState('');
  const [maxTokens, setMaxTokens] = useState(4096);

  // Stream lifecycle
  const [chatId, setChatId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  // Stored messages (source of truth for backend + persistence)
  const [storedMessages, setStoredMessages] = useState<StoredMessage[]>([]);

  // Display messages (derived text-only view for conversation column)
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [pendingAssistantText, setPendingAssistantText] = useState('');
  const pendingTextRef = useRef('');

  // Raw events
  const [events, setEvents] = useState<TimestampedEvent[]>([]);
  const [finishData, setFinishData] = useState<{
    finishReason: string;
    usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  } | null>(null);

  const eventsEndRef = useRef<HTMLDivElement>(null);
  const storedEndRef = useRef<HTMLDivElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Provider/model loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void (async () => {
      try {
        const data = await window.litho.aiProvider.list();
        setProviders(data.providers);
        setConnectedIds(data.connected);
        if (data.connected.length > 0) {
          setSelectedProvider(data.connected[0]);
        }
      } catch (err) {
        toast.error('Failed to load providers', {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const connectedProviders = useMemo(
    () => providers.filter((p) => connectedIds.includes(p.id)),
    [providers, connectedIds],
  );

  useEffect(() => {
    if (!selectedProvider) {
      setModels([]);
      setSelectedModel('');
      return;
    }
    void (async () => {
      try {
        const result = await window.litho.aiProvider.models(selectedProvider);
        setModels(result);
        if (result.length > 0) {
          setSelectedModel(result[0].id);
        } else {
          setSelectedModel('');
        }
      } catch {
        setModels([]);
        setSelectedModel('');
      }
    })();
  }, [selectedProvider]);

  // ---------------------------------------------------------------------------
  // Workspace + document loading
  // ---------------------------------------------------------------------------

  useEffect(() => {
    void (async () => {
      try {
        const state = await window.litho.workspace.getActive();
        const name = (state as { workspaceName: string | null }).workspaceName;
        setWorkspaceName(name);
      } catch {
        // no workspace
      }
    })();
  }, []);

  useEffect(() => {
    if (!workspaceName) {
      setDocuments([]);
      return;
    }
    void (async () => {
      try {
        const docs = (await window.litho.document.list(workspaceName)) as DocumentInfo[];
        setDocuments(docs);
      } catch {
        setDocuments([]);
      }
    })();
  }, [workspaceName]);

  // ---------------------------------------------------------------------------
  // Load conversation from DB when document changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!workspaceName || !selectedDocId) {
      setStoredMessages([]);
      setMessages([]);
      return;
    }
    void (async () => {
      try {
        const loaded = await window.litho.conversation.load(workspaceName, selectedDocId);
        setStoredMessages(loaded.messages);
        setMessages(extractDisplayMessages(loaded.messages));
      } catch {
        setStoredMessages([]);
        setMessages([]);
      }
    })();
  }, [workspaceName, selectedDocId]);

  // ---------------------------------------------------------------------------
  // Resolve agent context when workspace or agent changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.litho.preferences
      .getUserProfile()
      .then((profile) => setUserName(profile.name ?? ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!workspaceName) return;
    window.litho.workspace
      .getDesignSystemDocId(workspaceName)
      .then((id) => setDesignSystemDocId(id))
      .catch(() => {});
  }, [workspaceName]);

  useEffect(() => {
    if (!workspaceName) return;
    const fontExts = new Set(['.woff2', '.woff', '.ttf', '.otf']);
    window.litho.assets
      .list(workspaceName, '', true)
      .then((entries) => {
        const fonts = (entries as Array<{ type: string; ext: string; path: string }>).filter(
          (e) => e.type === 'file' && fontExts.has(e.ext),
        );
        if (fonts.length === 0) return;
        const fontPaths = fonts.map((f) => `@assets/${f.path}`).join('\n');
        setFontContext(`\n\nAvailable font files:\n${fontPaths}`);
      })
      .catch(() => {});
  }, [workspaceName]);

  useEffect(() => {
    if (!workspaceName) return;
    void (async () => {
      try {
        const entries = (await window.litho.assets.list(workspaceName, '', false)) as Array<{
          type: string;
          name: string;
        }>;
        const dirs = entries.filter((e) => e.type === 'directory').map((e) => e.name);
        const fileCount = entries.filter((e) => e.type === 'file').length;
        const dirList = dirs.length > 0 ? `\nTop-level directories: ${dirs.join(', ')}` : '';
        setAssetsSummary(
          `Assets: ${entries.length} item(s) (${fileCount} file(s))${dirList}\n` +
            'Usage: reference as @assets/path/to/file.ext\n' +
            'The agent can explore the assets directory to find specific files.',
        );
      } catch {
        // keep default
      }
    })();
  }, [workspaceName]);

  // ---------------------------------------------------------------------------
  // Build resolved context
  // ---------------------------------------------------------------------------

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId),
    [documents, selectedDocId],
  );

  const resolvedContext = useMemo((): AgentContext | null => {
    if (selectedAgent === 'none' || !selectedDocId) return null;
    return {
      docId: selectedDocId,
      title: selectedDoc?.title,
      width: selectedDoc?.size.width,
      height: selectedDoc?.size.height,
      unit: selectedDoc?.size.unit,
      userName: userName || undefined,
      fontContext: fontContext || undefined,
      assetsSummary,
      designSystemDocId,
    };
  }, [
    selectedAgent,
    selectedDocId,
    selectedDoc,
    userName,
    fontContext,
    assetsSummary,
    designSystemDocId,
  ]);

  // ---------------------------------------------------------------------------
  // Event subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!chatId) return;

    const cleanup = window.litho.chat.onDelta((id, data) => {
      if (id !== chatId) return;
      const event = data as ChatStreamEvent;
      setEvents((prev) => [...prev, { ts: Date.now(), event }]);
      requestAnimationFrame(() => {
        eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      });

      if (event.type === 'text-delta') {
        pendingTextRef.current += event.text;
        setPendingAssistantText(pendingTextRef.current);
      } else if (event.type === 'finish') {
        setFinishData({ finishReason: event.finishReason, usage: event.usage });
        setIsStreaming(false);
        setElapsed(Date.now() - (startTime ?? Date.now()));
        pendingTextRef.current = '';
        setPendingAssistantText('');

        // Update stored messages and derive display from them (single source of truth)
        const responseMessages = event.responseMessages ?? [];
        setStoredMessages((prev) => {
          const updated = responseMessages.length > 0 ? [...prev, ...responseMessages] : prev;
          if (workspaceName && selectedDocId && responseMessages.length > 0) {
            void window.litho.conversation.save(workspaceName, selectedDocId, updated, {
              inputTokens: 0,
              outputTokens: 0,
            });
          }
          // Derive display messages from the updated stored state
          setMessages(extractDisplayMessages(updated));
          return updated;
        });
      } else if (event.type === 'error') {
        setIsStreaming(false);
        setElapsed(Date.now() - (startTime ?? Date.now()));
        // On error, keep whatever text was accumulated as a display message
        if (pendingTextRef.current.length > 0) {
          setMessages((prev) => [...prev, { role: 'assistant', content: pendingTextRef.current }]);
        }
        pendingTextRef.current = '';
        setPendingAssistantText('');
      }
    });

    return cleanup;
  }, [chatId, startTime, workspaceName, selectedDocId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger deps for auto-scroll
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    storedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pendingAssistantText.length, storedMessages.length]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    if (!selectedProvider || !selectedModel || !userMessage.trim()) return;

    const text = userMessage.trim();
    const newUserDisplay: ConversationMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, newUserDisplay]);
    setUserMessage('');

    // Append to stored messages
    const userStored: StoredMessage = { role: 'user', content: text };
    const updatedStored = [...storedMessages, userStored];
    setStoredMessages(updatedStored);

    // Reset stream state (keep conversation)
    setEvents([]);
    pendingTextRef.current = '';
    setPendingAssistantText('');
    setFinishData(null);
    setElapsed(null);
    setIsStreaming(true);
    const now = Date.now();
    setStartTime(now);

    try {
      const agentId = selectedAgent === 'none' ? undefined : selectedAgent;
      const { chatId: newChatId } = await window.litho.chat.start({
        providerId: selectedProvider,
        modelId: selectedModel,
        system: systemPrompt || undefined,
        messages: updatedStored,
        maxOutputTokens: maxTokens,
        ...(agentId ? { agentId } : {}),
        ...(agentId && resolvedContext ? { agentContext: resolvedContext } : {}),
      });
      setChatId(newChatId);
    } catch (err) {
      toast.error('Failed to start chat', {
        description: err instanceof Error ? err.message : String(err),
      });
      setIsStreaming(false);
    }
  }, [
    selectedProvider,
    selectedModel,
    userMessage,
    systemPrompt,
    maxTokens,
    storedMessages,
    selectedAgent,
    resolvedContext,
  ]);

  const handleAbort = useCallback(async () => {
    if (!chatId) return;
    try {
      await window.litho.chat.abort(chatId);
    } catch (err) {
      toast.error('Failed to abort', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [chatId]);

  const handleClear = useCallback(() => {
    setMessages([]);
    setStoredMessages([]);
    pendingTextRef.current = '';
    setPendingAssistantText('');
    setEvents([]);
    setFinishData(null);
    setElapsed(null);
    setChatId(null);
    setStartTime(null);
    if (workspaceName && selectedDocId) {
      void window.litho.conversation.clear(workspaceName, selectedDocId);
    }
  }, [workspaceName, selectedDocId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAgent = selectedAgent !== 'none';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <MessageSquare className="h-5 w-5 text-forge" />
        <h1 className="text-lg font-semibold">Debug Chat</h1>
        {workspaceName && (
          <Badge variant="outline" className="font-mono text-[10px]">
            {workspaceName}
          </Badge>
        )}
        {isStreaming && (
          <Badge variant="outline" className="text-orange-500">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Streaming
          </Badge>
        )}
        {finishData && (
          <Badge variant="outline" className="text-green-600">
            {finishData.finishReason}
          </Badge>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={handleClear} disabled={isStreaming}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 border-b px-6 py-4">
        {/* Provider + Model row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Provider</span>
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {connectedProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Model</span>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Max tokens</span>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="h-9 w-24 rounded-md border bg-background px-2 text-sm"
            />
          </div>
        </div>

        {/* Agent + Document row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Agent</span>
            <Select
              value={selectedAgent}
              onValueChange={(v) => {
                const agent = v as AgentId | 'none';
                setSelectedAgent(agent);
                setSelectedDocId('');
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="design-system">Design System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasAgent && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Document</span>
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select document..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      <span className="flex items-center gap-2">
                        {doc.title}
                        <span className="text-[10px] text-muted-foreground">
                          {doc.type === 'design-system' ? '[DS]' : ''} {doc.id}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Agent context preview */}
        {hasAgent && <AgentContextPanel context={resolvedContext} />}

        {/* System prompt (collapsible) — hidden when agent is selected (uses templates) */}
        {!hasAgent && (
          <div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowSystem(!showSystem)}
            >
              {showSystem ? 'Hide' : 'Show'} system prompt
            </button>
            {showSystem && (
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System prompt..."
                className="mt-2 font-mono text-xs"
                rows={3}
              />
            )}
          </div>
        )}

        {/* Message + send/abort */}
        <div className="flex gap-2">
          <Textarea
            value={userMessage}
            onChange={(e) => setUserMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 text-sm"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              onClick={handleSend}
              disabled={isStreaming || !selectedModel || !userMessage.trim()}
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              Send
            </Button>
            <Button size="sm" variant="outline" onClick={handleAbort} disabled={!isStreaming}>
              <Square className="mr-1 h-3.5 w-3.5" />
              Abort
            </Button>
          </div>
        </div>
      </div>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Raw events */}
        <div className="flex w-1/3 flex-col border-r">
          <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            Raw Events ({events.length})
          </div>
          <div className="flex-1 overflow-auto p-3">
            {events.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Events will appear here...
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {events.map((e, i) => (
                  <div key={`${e.ts}-${i}`} className="rounded border bg-muted/30 p-2">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {e.event.type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        +{startTime ? e.ts - startTime : 0}ms
                      </span>
                    </div>
                    <pre className="text-[11px] leading-tight text-muted-foreground whitespace-pre-wrap break-all">
                      {JSON.stringify(e.event, null, 2)}
                    </pre>
                  </div>
                ))}
                <div ref={eventsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Middle: Stored messages (full fidelity) */}
        <div className="flex w-1/3 flex-col border-r">
          <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            Stored Messages ({storedMessages.length})
          </div>
          <div className="flex-1 overflow-auto p-3">
            {storedMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Stored messages will appear here...
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {storedMessages.map((msg, i) => (
                  <div key={`stored-${msg.role}-${i}`} className="rounded border bg-muted/30 p-2">
                    <div className="mb-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1 py-0 ${
                          msg.role === 'user'
                            ? 'text-blue-500'
                            : msg.role === 'assistant'
                              ? 'text-orange-500'
                              : 'text-green-500'
                        }`}
                      >
                        {msg.role}
                      </Badge>
                    </div>
                    <pre className="text-[11px] leading-tight text-muted-foreground whitespace-pre-wrap break-all">
                      {JSON.stringify(msg.content, null, 2)}
                    </pre>
                  </div>
                ))}
                <div ref={storedEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Right: Conversation history (text-only) */}
        <div className="flex w-1/3 flex-col">
          <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
            Conversation ({messages.length} messages)
          </div>
          <div className="flex-1 overflow-auto p-4">
            {messages.length === 0 && !pendingAssistantText ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Conversation will appear here...
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((msg, i) => (
                  <div key={`${msg.role}-${i}`} className="flex flex-col gap-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      {msg.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <div
                      className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-muted/50'
                          : 'border border-orange-500/20 bg-orange-500/5'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {pendingAssistantText && (
                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-medium text-muted-foreground">
                      Assistant
                      <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />
                    </div>
                    <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 text-sm whitespace-pre-wrap">
                      {pendingAssistantText}
                    </div>
                  </div>
                )}
                <div ref={conversationEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      {finishData && (
        <div className="flex items-center gap-4 border-t px-6 py-2 text-xs text-muted-foreground">
          <span>
            Finish: <span className="font-mono font-medium">{finishData.finishReason}</span>
          </span>
          <span>
            Input: <span className="font-mono">{finishData.usage.inputTokens}</span>
          </span>
          <span>
            Output: <span className="font-mono">{finishData.usage.outputTokens}</span>
          </span>
          <span>
            Total: <span className="font-mono">{finishData.usage.totalTokens}</span>
          </span>
          {elapsed !== null && (
            <span>
              Elapsed: <span className="font-mono">{(elapsed / 1000).toFixed(1)}s</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export { DebugChatPage };
