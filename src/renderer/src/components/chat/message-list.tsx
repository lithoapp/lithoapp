import { AlertTriangle, CircleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { getDiagnosticSeverity, stripDiagnosticPrefix } from '@/hooks/use-post-turn-diagnostics';
import type {
  PageInfo,
  StoredAssistantMessage,
  StoredMessage,
  StoredUserMessage,
} from '../../../../shared/types';
import { PersistedActivityLog, StreamingActivityLog } from './activity-log';
import type { StreamingPart } from './types';

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

  const severity = getDiagnosticSeverity(message.content);
  const displayText = severity ? stripDiagnosticPrefix(message.content) : message.content;

  if (severity === 'error') {
    return (
      <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="text-sm whitespace-pre-wrap">{displayText}</div>
      </div>
    );
  }

  if (severity === 'warning') {
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
  pages,
}: {
  messages: StoredMessage[];
  pages?: PageInfo[];
}): React.JSX.Element {
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
// Message list
// ---------------------------------------------------------------------------

export function MessageList({
  messages,
  streamingParts,
  isStreaming,
  pages,
  hideFirstUserMessage,
}: {
  messages: StoredMessage[];
  streamingParts: StreamingPart[];
  isStreaming: boolean;
  pages?: PageInfo[];
  hideFirstUserMessage?: boolean;
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
            pages={pages}
          />
        );
      })}

      {/* Streaming turn */}
      {isStreaming && <StreamingActivityLog streamingParts={streamingParts} pages={pages} />}

      <div ref={endRef} />
    </div>
  );
}
