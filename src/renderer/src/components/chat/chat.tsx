import {
  AlertCircle,
  ArrowLeft,
  Bug,
  LayoutList,
  Loader2,
  Minus,
  Send,
  Square,
  SquarePen,
  Timer,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatMessage } from '@/hooks/use-chat';
import { useChat } from '@/hooks/use-chat';
import type { OpencodeClient } from '@/lib/opencode-client-types';
import { ChatCover } from './chat-cover';
import { ActivityLog } from './message-activity-log';
import { MessageDebug, UserMessageView } from './message-list';
import { StatusLine } from './message-status-line';
import { Timeline } from './message-timeline';
import { ModelSelector } from './model-selector';
import { PermissionCard } from './permission-card';

// ---------------------------------------------------------------------------
// Display modes
// ---------------------------------------------------------------------------

type DisplayMode = 'activity' | 'status' | 'timeline' | 'debug';

const ASSISTANT_COMPONENTS: Record<
  DisplayMode,
  React.ComponentType<{ message: ChatMessage; isStreaming?: boolean; docSlug?: string }>
> = {
  activity: ActivityLog,
  status: StatusLine,
  timeline: Timeline,
  debug: MessageDebug,
};

const DISPLAY_MODE_LABELS: Record<DisplayMode, { label: string; icon: React.ElementType }> = {
  activity: { label: 'Activity', icon: LayoutList },
  status: { label: 'Minimal', icon: Minus },
  timeline: { label: 'Timeline', icon: Timer },
  debug: { label: 'Debug', icon: Bug },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function Chat({
  directory,
  systemPrompt,
  agentName,
  sessionId,
  client,
  baseUrl,
  onBack,
  onNewChat,
  kickoffMessage,
  onFileEdit,
  snapshotIndex,
  onRevert,
  captureFiles,
  docSlug,
  onTurnSnapshot,
}: {
  directory: string;
  systemPrompt: string;
  agentName?: string;
  docSlug?: string;
  sessionId: string;
  client: OpencodeClient | null;
  baseUrl: string | null;
  onBack?: () => void;
  onNewChat?: () => void;
  kickoffMessage?: string;
  onFileEdit?: (filePath: string) => void;
  snapshotIndex?: Record<string, string>;
  onRevert?: (assistantMessageId: string) => Promise<void>;
  captureFiles?: () => Promise<Record<string, string>>;
  onTurnSnapshot?: (data: {
    files: Record<string, string>;
    assistantMessageId: string;
    promptExcerpt: string;
  }) => void;
}): React.JSX.Element {
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [input, setInput] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('activity');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [kickoffSent, setKickoffSent] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const chat = useChat({
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
  });

  const handleRevert = useCallback(
    async (msg: ChatMessage) => {
      if (onRevert) await onRevert(msg.info.id);
      await chat.revert(msg.info.id);
    },
    [onRevert, chat],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset + load on session change
  useEffect(() => {
    setKickoffSent(false);
    setLoaded(false);
    void chat.loadMessages().finally(() => setLoaded(true));
  }, [sessionId]);

  // Auto-scroll on new messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on data change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages, chat.pendingPermissions]);

  const handleSend = useCallback(() => {
    if (!input.trim() || chat.sending) return;
    const text = input;
    setInput('');
    chat.sendMessage(text);
  }, [input, chat]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleKickoff = useCallback(() => {
    if (!kickoffMessage) return;
    setKickoffSent(true);
    void chat.sendMessage(kickoffMessage);
  }, [kickoffMessage, chat]);

  const displayMessages = useMemo(() => {
    if (!kickoffMessage) return chat.messages;
    let skipped = false;
    return chat.messages.filter((msg) => {
      if (skipped || msg.info.role !== 'user') return true;
      skipped = true;
      return false;
    });
  }, [chat.messages, kickoffMessage]);

  const showCover = Boolean(kickoffMessage) && loaded && chat.messages.length === 0 && !kickoffSent;
  const isBusy = chat.sessionStatus?.type === 'busy';
  const totalTok = chat.totalTokens.input + chat.totalTokens.output + chat.totalTokens.reasoning;

  if (showCover) {
    return (
      <ChatCover
        client={client}
        providerId={providerId}
        modelId={modelId}
        onModelSelect={(pId, mId) => {
          setProviderId(pId);
          setModelId(mId);
        }}
        onStart={handleKickoff}
      />
    );
  }

  const AssistantView = ASSISTANT_COMPONENTS[displayMode];
  const CurrentModeIcon = DISPLAY_MODE_LABELS[displayMode].icon;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        {onBack && (
          <Button size="icon-sm" variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        )}

        <ModelSelector
          client={client}
          providerId={providerId}
          modelId={modelId}
          onSelect={(pId, mId) => {
            setProviderId(pId);
            setModelId(mId);
          }}
        />

        {onNewChat && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={onNewChat}>
                <SquarePen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New chat</TooltipContent>
          </Tooltip>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="text-right text-[11px] text-muted-foreground font-mono">
            {chat.totalCost > 0 && <div>${chat.totalCost.toFixed(2)}</div>}
            {totalTok > 0 && <div className="text-[10px]">{formatTokens(totalTok)} tokens</div>}
          </div>

          {/* Display mode toggle */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost">
                    <CurrentModeIcon className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Display mode</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={displayMode}
                onValueChange={(v) => setDisplayMode(v as DisplayMode)}
              >
                {(
                  Object.entries(DISPLAY_MODE_LABELS) as [
                    DisplayMode,
                    (typeof DISPLAY_MODE_LABELS)[DisplayMode],
                  ][]
                ).map(([mode, { label, icon: Icon }]) => (
                  <DropdownMenuRadioItem key={mode} value={mode} className="gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-start gap-1 p-3">
          {displayMessages.length === 0 && !kickoffMessage && (
            <p className="text-center text-xs text-muted-foreground py-8">
              Send a message to begin
            </p>
          )}

          {displayMessages.map((msg, idx) => {
            if (msg.info.role === 'user') {
              const nextMsg = displayMessages[idx + 1];
              const relatedAssistant =
                nextMsg?.info.role === 'assistant' && snapshotIndex?.[nextMsg.info.id]
                  ? nextMsg
                  : undefined;
              return (
                <UserMessageView
                  key={msg.info.id}
                  message={msg}
                  snapshotId={
                    relatedAssistant ? snapshotIndex?.[relatedAssistant.info.id] : undefined
                  }
                  onRevert={relatedAssistant ? () => handleRevert(relatedAssistant) : undefined}
                />
              );
            }

            const isLastAssistant = idx === displayMessages.length - 1;
            return (
              <AssistantView
                key={msg.info.id}
                message={msg}
                isStreaming={isBusy && isLastAssistant}
                docSlug={docSlug}
              />
            );
          })}

          {chat.pendingPermissions.map((pp) => (
            <PermissionCard
              key={pp.permission.id}
              permission={pp.permission}
              responding={pp.responding}
              onReply={chat.replyPermission}
            />
          ))}
        </div>
      </div>

      {/* Error */}
      {chat.error && (
        <div className="flex items-center gap-1.5 border-t px-3 py-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{chat.error}</span>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-2">
        <div className="flex gap-1.5">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-[36px] max-h-24 resize-none text-sm"
            rows={1}
          />
          {isBusy ? (
            <Button size="icon-sm" variant="destructive" onClick={chat.abort}>
              <Square className="h-3 w-3 fill-current" />
            </Button>
          ) : (
            <Button size="icon-sm" onClick={handleSend} disabled={!input.trim() || chat.sending}>
              {chat.sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
