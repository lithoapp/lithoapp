import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isDiagnosticMessage, stripDiagnosticPrefix } from '@/hooks/use-post-turn-diagnostics';
import type {
  PageInfo,
  StoredAssistantMessage,
  StoredMessage,
  StoredUserMessage,
} from '../../../../shared/types';
import { PersistedActivityLog, StreamingActivityLog } from './activity-log';
import { DebugView } from './debug-view';
import type { DisplayMode, StreamingToolCall } from './types';

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
// User message view
// ---------------------------------------------------------------------------

function UserMessageView({
  message,
  isHidden,
}: {
  message: StoredUserMessage;
  isHidden?: boolean;
}): React.JSX.Element | null {
  if (isHidden) return null;

  const isDiagnostic = isDiagnosticMessage(message.content);
  const displayText = isDiagnostic ? stripDiagnosticPrefix(message.content) : message.content;

  if (isDiagnostic) {
    return (
      <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="text-sm whitespace-pre-wrap">{displayText}</div>
      </div>
    );
  }

  return (
    <div className="ml-8 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{displayText}</div>
  );
}

// ---------------------------------------------------------------------------
// Assistant turn view
// ---------------------------------------------------------------------------

function AssistantTurnView({
  messages,
  displayMode,
  pages,
}: {
  messages: StoredMessage[];
  displayMode: DisplayMode;
  pages?: PageInfo[];
}): React.JSX.Element {
  // Extract assistant messages from the group
  const assistantMessages = messages.filter(
    (m): m is StoredAssistantMessage => m.role === 'assistant',
  );

  if (displayMode === 'debug') {
    return (
      <div className="flex flex-col gap-1">
        {messages.map((msg, i) => (
          <DebugView key={`debug-${msg.role}-${String(i)}`} message={msg} />
        ))}
      </div>
    );
  }

  // Activity mode: render each assistant message as activity log
  return (
    <div className="flex flex-col gap-1">
      {assistantMessages.map((msg, i) => (
        <PersistedActivityLog key={`activity-${String(i)}`} message={msg} pages={pages} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message list
// ---------------------------------------------------------------------------

export function MessageList({
  messages,
  streamingText,
  streamingToolCalls,
  isStreaming,
  displayMode,
  pages,
  hideFirstUserMessage,
}: {
  messages: StoredMessage[];
  streamingText: string;
  streamingToolCalls: StreamingToolCall[];
  isStreaming: boolean;
  displayMode: DisplayMode;
  pages?: PageInfo[];
  hideFirstUserMessage?: boolean;
}): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message changes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText.length, streamingToolCalls.length]);

  const turns = groupMessagesIntoTurns(messages);

  return (
    <div className="flex flex-col gap-4 p-4">
      {turns.map((turn, i) => {
        if (turn.type === 'user') {
          return (
            <UserMessageView
              key={`user-${String(i)}`}
              message={turn.message}
              isHidden={hideFirstUserMessage && i === 0}
            />
          );
        }
        return (
          <AssistantTurnView
            key={`assistant-${String(i)}`}
            messages={turn.messages}
            displayMode={displayMode}
            pages={pages}
          />
        );
      })}

      {/* Streaming turn */}
      {isStreaming && (
        <StreamingActivityLog
          streamingText={streamingText}
          streamingToolCalls={streamingToolCalls}
          pages={pages}
        />
      )}

      <div ref={endRef} />
    </div>
  );
}
