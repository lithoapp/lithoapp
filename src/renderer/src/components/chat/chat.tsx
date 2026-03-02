import { ArrowUp, Loader2, MessageSquarePlus, Square, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type AgentContext, useChatV2 } from '@/hooks/use-chat';
import { loadChatPrefs, saveChatPrefs } from '@/lib/chat-prefs';
import type { PageInfo } from '../../../../shared/types';
import { ChatCover } from './chat-cover';
import { MessageList } from './message-list';
import { ModelSelector } from './model-selector';
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
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(count);
}

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
  const [input, setInput] = useState('');
  const [kickoffSent, setKickoffSent] = useState(false);
  const [pendingKickoff, setPendingKickoff] = useState(false);

  // Offline detection
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

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
    void chat.clearConversation();
    if (kickoffMessage) {
      setPendingKickoff(true);
    }
  }, [chat, kickoffMessage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on document change
  useEffect(() => {
    setKickoffSent(false);
    setPendingKickoff(false);
  }, [documentId]);

  // Send kickoff after conversation has been cleared (avoids stale closure)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fire once messages are empty
  useEffect(() => {
    if (pendingKickoff && chat.messages.length === 0 && !chat.isStreaming && kickoffMessage) {
      setPendingKickoff(false);
      setKickoffSent(true);
      void chat.sendMessage(kickoffMessage);
    }
  }, [pendingKickoff, chat.messages.length, chat.isStreaming]);

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
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTokens(chat.usage.totalTokens)} tokens
          </span>
        )}

        {/* New chat */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={chat.isStreaming || isConversationEmpty}
              title="New chat"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start new chat?</AlertDialogTitle>
              <AlertDialogDescription>
                This will clear the current conversation. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleNewChat}>Start new chat</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto">
        <MessageList
          messages={chat.messages}
          streamingParts={chat.streamingParts}
          isStreaming={chat.isStreaming}
          pages={pages}
          hideFirstUserMessage={hideFirstUserMessage}
        />
      </div>

      {/* Offline */}
      {isOffline && (
        <div className="flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          You're offline. Reconnect to continue.
        </div>
      )}

      {/* Retrying */}
      {chat.retryState && (
        <div className="flex items-center gap-2 border-t border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          Retrying… ({chat.retryState.attempt}/{chat.retryState.maxAttempts})
        </div>
      )}

      {/* Error */}
      {chat.error && (
        <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {chat.error}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="max-h-[120px] min-h-[40px] flex-1 resize-none text-sm"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {chat.isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={handleAbort}
              className="h-8 w-8 shrink-0 rounded-full"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || !providerId || !modelId || isOffline}
              className="h-8 w-8 shrink-0 rounded-full"
              title="Send (Enter)"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
