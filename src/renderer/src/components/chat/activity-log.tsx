import { AlertCircle, Eye, Loader2, Pencil, Plus, Search, Terminal } from 'lucide-react';
import type { PageInfo, StoredAssistantMessage } from '../../../../shared/types';
import {
  type ChatDocumentLabelContext,
  resolveToolLabel,
  type ToolIcon,
  type ToolLabel,
} from './message-tool-labels';
import { StreamingMarkdown } from './streaming-markdown';
import type { StreamingPart, StreamingToolCallPart } from './types';

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const ICON_MAP: Record<ToolIcon, React.ElementType> = {
  search: Search,
  eye: Eye,
  pencil: Pencil,
  plus: Plus,
  error: AlertCircle,
  terminal: Terminal,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolLine({ label, isActive }: { label: ToolLabel; isActive: boolean }): React.JSX.Element {
  const Icon = ICON_MAP[label.icon];
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
      {isActive ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-3 w-3 shrink-0" />
      )}
      <span>{isActive ? label.activeLabel : label.doneLabel}</span>
    </div>
  );
}

function ThinkingIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      <span>Working on it…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persisted assistant turn
// ---------------------------------------------------------------------------

export function PersistedActivityLog({
  message,
  currentDocumentId,
  documents,
  pages,
}: {
  message: StoredAssistantMessage;
  currentDocumentId?: string;
  documents?: ChatDocumentLabelContext[];
  pages?: PageInfo[];
}): React.JSX.Element {
  if (typeof message.content === 'string') {
    return <StreamingMarkdown text={message.content} isStreaming={false} />;
  }

  return (
    <div className="w-full">
      {message.content.map((part, i) => {
        if (part.type === 'tool-call') {
          const call = part as { toolCallId: string; toolName: string; input: unknown };
          const label = resolveToolLabel(
            call.toolName,
            (call.input ?? {}) as Record<string, unknown>,
            currentDocumentId,
            documents,
            pages,
          );
          return <ToolLine key={call.toolCallId} label={label} isActive={false} />;
        }
        if (part.type === 'text') {
          const text = (part as { text: string }).text;
          if (!text) return null;
          return (
            <div key={`text-${String(i)}`} className="w-full pt-1">
              <StreamingMarkdown text={text} isStreaming={false} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming assistant turn (in-progress)
// ---------------------------------------------------------------------------

export function StreamingActivityLog({
  streamingParts,
  currentDocumentId,
  documents,
  pages,
}: {
  streamingParts: StreamingPart[];
  currentDocumentId?: string;
  documents?: ChatDocumentLabelContext[];
  pages?: PageInfo[];
}): React.JSX.Element {
  const visibleParts = streamingParts.filter((p) => p.type !== 'reasoning');

  if (visibleParts.length === 0) {
    return <ThinkingIndicator />;
  }

  const lastPart = visibleParts[visibleParts.length - 1];
  const allToolsDone = visibleParts
    .filter((p): p is StreamingToolCallPart => p.type === 'tool-call')
    .every((tc) => tc.status === 'completed');
  // Show trailing indicator when all tool calls are done and no text is actively streaming
  const showTrailingSpinner = lastPart.type === 'tool-call' && allToolsDone;

  return (
    <div className="w-full">
      {streamingParts.map((part, i) => {
        if (part.type === 'reasoning') return null;
        if (part.type === 'tool-call') {
          const label = resolveToolLabel(
            part.toolName,
            (part.input ?? {}) as Record<string, unknown>,
            currentDocumentId,
            documents,
            pages,
          );
          return (
            <ToolLine key={part.toolCallId} label={label} isActive={part.status === 'calling'} />
          );
        }
        const isLastPart = i === streamingParts.length - 1;
        return (
          <div key={`text-${String(i)}`} className="w-full pt-1">
            <StreamingMarkdown text={part.text} isStreaming={isLastPart} />
          </div>
        );
      })}
      {showTrailingSpinner && <ThinkingIndicator />}
    </div>
  );
}
