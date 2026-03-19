import { AlertTriangle, CircleAlert, Copy, Pencil, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { isVisualEditMessage, VisualEditContent } from '@/components/edit-mode/visual-edit-message';
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
import { getDiagnosticSeverity, stripDiagnosticPrefix } from '@/hooks/use-post-turn-diagnostics';
import type {
  AgentContext,
  AgentId,
  PageInfo,
  StoredAssistantMessage,
  StoredMessage,
  StoredUserMessage,
} from '../../../../shared/types';
import { promptTemplates, renderTemplate } from '../../lib/prompt-templates';
import { PersistedActivityLog, StreamingActivityLog } from './activity-log';
import { PersistedDebugView, StreamingDebugView } from './debug-view';
import type { DisplayMode, StreamingPart } from './types';

// ---------------------------------------------------------------------------
// Turn grouping
// ---------------------------------------------------------------------------

interface UserTurn {
  type: 'user';
  message: StoredUserMessage;
}

interface AssistantTurn {
  type: 'assistant';
  messages: StoredMessage[]; // assistant + following tool messages
}

type Turn = UserTurn | AssistantTurn;

function groupMessagesIntoTurns(messages: StoredMessage[]): Turn[] {
  const turns: Turn[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      turns.push({ type: 'user', message: msg });
    } else if (msg.role === 'assistant') {
      // Group this assistant message with following tool messages
      const group: StoredMessage[] = [msg];
      while (i + 1 < messages.length && messages[i + 1].role === 'tool') {
        i++;
        group.push(messages[i]);
      }
      // If followed by another assistant (continuation after tool), include it
      while (
        i + 1 < messages.length &&
        (messages[i + 1].role === 'assistant' || messages[i + 1].role === 'tool')
      ) {
        i++;
        group.push(messages[i]);
      }
      turns.push({ type: 'assistant', messages: group });
    }
    // tool messages without preceding assistant are skipped (shouldn't happen)
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Revert button
// ---------------------------------------------------------------------------

function RevertButton({ onRevert }: { onRevert: () => void }): React.JSX.Element {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="absolute right-0 top-full mt-0.5 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground"
          title="Revert to before this message"
        >
          <RotateCcw className="h-4 w-4" />
          Revert
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revert to before this message?</AlertDialogTitle>
          <AlertDialogDescription>
            The document and conversation will be restored to the state before this message. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onRevert}>Revert</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// User message view
// ---------------------------------------------------------------------------

function UserMessageView({
  message,
  isHidden,
  isStreaming,
  onRevert,
  canRevert,
}: {
  message: StoredUserMessage;
  isHidden?: boolean;
  isStreaming?: boolean;
  onRevert?: (userMessageId: string) => void;
  canRevert?: boolean;
}): React.JSX.Element | null {
  if (isHidden) return null;

  const severity = getDiagnosticSeverity(message.content);
  const displayText = severity ? stripDiagnosticPrefix(message.content) : message.content;

  const revertButton =
    message.id && onRevert && canRevert && !isStreaming ? (
      <RevertButton onRevert={() => onRevert(message.id as string)} />
    ) : null;

  if (isVisualEditMessage(message.content)) {
    return (
      <div className="group relative rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-primary">Visual Edit</span>
        </div>
        <VisualEditContent text={displayText} />
        {revertButton}
      </div>
    );
  }

  if (severity === 'error') {
    return (
      <div className="group relative flex gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="text-sm whitespace-pre-wrap">{displayText}</div>
        {revertButton}
      </div>
    );
  }

  if (severity === 'warning') {
    return (
      <div className="group relative flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="text-sm whitespace-pre-wrap">{displayText}</div>
        {revertButton}
      </div>
    );
  }

  return (
    <div className="group relative ml-8 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
      {displayText}
      {revertButton}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant turn view
// ---------------------------------------------------------------------------

function AssistantTurnView({
  messages,
  pages,
  displayMode,
  isFirstTurn,
  agentId,
  agentContext,
}: {
  messages: StoredMessage[];
  pages?: PageInfo[];
  displayMode: DisplayMode;
  isFirstTurn?: boolean;
  agentId?: AgentId;
  agentContext?: AgentContext;
}): React.JSX.Element {
  if (displayMode === 'debug') {
    return (
      <PersistedDebugView
        messages={messages}
        agentId={isFirstTurn ? agentId : undefined}
        agentContext={isFirstTurn ? agentContext : undefined}
      />
    );
  }

  const assistantMessages = messages.filter(
    (m): m is StoredAssistantMessage => m.role === 'assistant',
  );

  return (
    <div className="flex flex-col gap-1">
      {assistantMessages.map((msg, i) => (
        <PersistedActivityLog key={`activity-${String(i)}`} message={msg} pages={pages} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy conversation button (debug only)
// ---------------------------------------------------------------------------

function CopyConversationButton({
  messages,
  agentId,
  agentContext,
}: {
  messages: StoredMessage[];
  agentId?: AgentId;
  agentContext?: AgentContext;
}): React.JSX.Element {
  const systemPrompt = useMemo(
    () =>
      agentId && agentContext
        ? renderTemplate(promptTemplates[agentId].system, agentContext)
        : null,
    [agentId, agentContext],
  );

  function handleCopy(): void {
    const json = JSON.stringify({ systemPrompt, messages }, null, 2);
    navigator.clipboard.writeText(json).catch(() => null);
    toast.success('Copied conversation JSON');
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Copy className="h-3 w-3" />
      Copy conversation JSON
    </button>
  );
}

// ---------------------------------------------------------------------------
// Message list
// ---------------------------------------------------------------------------

export function MessageList({
  messages,
  streamingParts,
  isStreaming,
  pages,
  hideFirstUserMessage,
  onRevert,
  revertibleMessageIds,
  displayMode = 'activity',
  agentId,
  agentContext,
}: {
  messages: StoredMessage[];
  streamingParts: StreamingPart[];
  isStreaming: boolean;
  pages?: PageInfo[];
  hideFirstUserMessage?: boolean;
  onRevert?: (userMessageId: string) => void;
  revertibleMessageIds?: Set<string>;
  displayMode?: DisplayMode;
  agentId?: AgentId;
  agentContext?: AgentContext;
}): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);

  // Derive scroll trigger from parts content
  const streamingContentSize = streamingParts.reduce(
    (acc, p) => acc + (p.type === 'text' ? p.text.length : 1),
    0,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContentSize]);

  const turns = groupMessagesIntoTurns(messages);
  let firstAssistantSeen = false;

  return (
    <div className="flex flex-col gap-4 p-4">
      {turns.map((turn, i) => {
        if (turn.type === 'user') {
          return (
            <UserMessageView
              key={`user-${String(i)}`}
              message={turn.message}
              isHidden={hideFirstUserMessage && i === 0}
              isStreaming={isStreaming}
              onRevert={onRevert}
              canRevert={turn.message.id ? revertibleMessageIds?.has(turn.message.id) : false}
            />
          );
        }
        const isFirstTurn = !firstAssistantSeen;
        firstAssistantSeen = true;
        return (
          <AssistantTurnView
            key={`assistant-${String(i)}`}
            messages={turn.messages}
            pages={pages}
            displayMode={displayMode}
            isFirstTurn={isFirstTurn}
            agentId={agentId}
            agentContext={agentContext}
          />
        );
      })}

      {/* Streaming turn */}
      {isStreaming &&
        (displayMode === 'debug' ? (
          <StreamingDebugView
            streamingParts={streamingParts}
            agentId={!firstAssistantSeen ? agentId : undefined}
            agentContext={!firstAssistantSeen ? agentContext : undefined}
          />
        ) : (
          <StreamingActivityLog streamingParts={streamingParts} pages={pages} />
        ))}

      {displayMode === 'debug' && messages.length > 0 && !isStreaming && (
        <CopyConversationButton messages={messages} agentId={agentId} agentContext={agentContext} />
      )}

      <div ref={endRef} />
    </div>
  );
}
