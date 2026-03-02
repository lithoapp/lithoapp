import { Bug, Loader2, MessageSquarePlus, Send, Square, Workflow } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type AgentContext, useChatV2 } from '@/hooks/use-chat';
import { loadChatPrefs, saveChatPrefs } from '@/lib/chat-prefs';
import type { PageInfo } from '../../../../shared/types';
import { ChatCover } from './chat-cover';
import { MessageList } from './message-list';
import { ModelSelector } from './model-selector';
import type { DisplayMode } from './types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatProps {
  workspaceName: string;
  documentId: string;
  agentId: 'document' | 'design-system';
  agentContext: AgentContext;
  kickoffMessage?: string;
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
  sendMessageRef?: React.RefObject<((text: string) => void) | null>;
  onBusyChange?: (isBusy: boolean) => void;
  pages?: PageInfo[];
}

// ---------------------------------------------------------------------------
// Display mode icons
// ---------------------------------------------------------------------------

const DISPLAY_MODES: Array<{ mode: DisplayMode; icon: React.ElementType; label: string }> = [
  { mode: 'activity', icon: Workflow, label: 'Activity' },
  { mode: 'debug', icon: Bug, label: 'Debug' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Chat({
  workspaceName,
  documentId,
  agentId,
  agentContext,
  kickoffMessage,
  onToolComplete,
  sendMessageRef,
  onBusyChange,
  pages,
}: ChatProps): React.JSX.Element {
  // Provider / model from localStorage
  const [providerId, setProviderId] = useState(() => loadChatPrefs().providerId);
  const [modelId, setModelId] = useState(() => loadChatPrefs().modelId);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('activity');
  const [input, setInput] = useState('');
  const [kickoffSent, setKickoffSent] = useState(false);

  // Ref for provider/model so the hook can read at send time without re-subscribing
  const providerModelRef = useRef({ providerId, modelId });
  providerModelRef.current = { providerId, modelId };

  const chat = useChatV2({
    workspaceName,
    documentId,
    agentId,
    agentContext,
    providerModelRef,
    onToolComplete,
  });

  // ---------------------------------------------------------------------------
  // Sync busy state to parent
  // ---------------------------------------------------------------------------

  useEffect(() => {
    onBusyChange?.(chat.isStreaming);
  }, [chat.isStreaming, onBusyChange]);

  // ---------------------------------------------------------------------------
  // Model selection
  // ---------------------------------------------------------------------------

  const handleModelSelect = useCallback((pid: string, mid: string) => {
    setProviderId(pid);
    setModelId(mid);
    saveChatPrefs({ providerId: pid, modelId: mid });
  }, []);

  // ---------------------------------------------------------------------------
  // Send / abort
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || chat.isStreaming) return;
    setInput('');
    void chat.sendMessage(text);
  }, [input, chat]);

  const handleAbort = useCallback(() => {
    void chat.abort();
  }, [chat]);

  // ---------------------------------------------------------------------------
  // Expose send for diagnostic injection
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!sendMessageRef) return;
    sendMessageRef.current = (text: string) => {
      void chat.sendMessage(text);
    };
    return () => {
      sendMessageRef.current = null;
    };
  }, [sendMessageRef, chat]);

  // ---------------------------------------------------------------------------
  // Kickoff
  // ---------------------------------------------------------------------------

  const handleKickoff = useCallback(() => {
    if (!kickoffMessage) return;
    setKickoffSent(true);
    void chat.sendMessage(kickoffMessage);
  }, [kickoffMessage, chat]);

  const handleNewChat = useCallback(() => {
    setKickoffSent(false);
    void chat.clearConversation();
  }, [chat]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on document change
  useEffect(() => {
    setKickoffSent(false);
  }, [documentId]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const isConversationEmpty = chat.messages.length === 0 && !chat.isStreaming;
  const showCover = kickoffMessage && isConversationEmpty && !kickoffSent;
  const hideFirstUserMessage = Boolean(kickoffMessage);

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (chat.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Kickoff cover
  // ---------------------------------------------------------------------------

  if (showCover) {
    return (
      <ChatCover
        providerId={providerId}
        modelId={modelId}
        onModelSelect={handleModelSelect}
        onStart={handleKickoff}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Main chat UI
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <ModelSelector providerId={providerId} modelId={modelId} onSelect={handleModelSelect} />
        <div className="flex-1" />

        {/* Usage */}
        {chat.usage.totalTokens > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {chat.usage.totalTokens.toLocaleString()} tokens
          </span>
        )}

        {/* Display mode toggle */}
        <div className="flex gap-0.5">
          {DISPLAY_MODES.map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant={displayMode === mode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setDisplayMode(mode)}
              title={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>

        {/* New chat */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleNewChat}
          disabled={chat.isStreaming}
          title="New chat"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto">
        <MessageList
          messages={chat.messages}
          streamingText={chat.streamingText}
          streamingToolCalls={chat.streamingToolCalls}
          isStreaming={chat.isStreaming}
          displayMode={displayMode}
          pages={pages}
          hideFirstUserMessage={hideFirstUserMessage}
        />
      </div>

      {/* Error */}
      {chat.error && (
        <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {chat.error}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[40px] flex-1 resize-none text-sm"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {chat.isStreaming ? (
            <Button size="sm" variant="destructive" onClick={handleAbort} className="self-end">
              <Square className="mr-1 h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!input.trim() || !providerId || !modelId}
              className="self-end"
            >
              <Send className="mr-1 h-3.5 w-3.5" />
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
