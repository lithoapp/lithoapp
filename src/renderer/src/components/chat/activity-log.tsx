import { AlertCircle, Brain, Eye, Loader2, Pencil, Plus, Search, Terminal } from 'lucide-react';
import {
  resolveToolLabel,
  type ToolIcon,
  type ToolLabel,
} from './message-tool-labels';
import type { PageInfo, StoredAssistantMessage } from '../../../../shared/types';
import { StreamingMarkdown } from './streaming-markdown';
import type { StreamingToolCall } from './types';

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
      <span>{label.label}</span>
    </div>
  );
}

function ThinkingIndicator(): React.JSX.Element {
  return (
    <div className="flex animate-pulse items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
      <Brain className="h-3 w-3 shrink-0" />
      <span>Thinking…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persisted assistant turn
// ---------------------------------------------------------------------------

export function PersistedActivityLog({
  message,
  pages,
}: {
  message: StoredAssistantMessage;
  pages?: PageInfo[];
}): React.JSX.Element {
  if (typeof message.content === 'string') {
    return <StreamingMarkdown text={message.content} isStreaming={false} />;
  }

  const toolCalls = message.content.filter((p) => p.type === 'tool-call');
  const textParts = message.content.filter((p) => p.type === 'text');
  const text = textParts.map((p) => (p as { text: string }).text).join('');

  return (
    <div className="w-full">
      {toolCalls.map((tc) => {
        const call = tc as { toolCallId: string; toolName: string; input: unknown };
        const label = resolveToolLabel(
          call.toolName,
          (call.input ?? {}) as Record<string, unknown>,
          pages,
        );
        return <ToolLine key={call.toolCallId} label={label} isActive={false} />;
      })}
      {text && (
        <div className="w-full pt-1">
          <StreamingMarkdown text={text} isStreaming={false} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming assistant turn (in-progress)
// ---------------------------------------------------------------------------

export function StreamingActivityLog({
  streamingText,
  streamingToolCalls,
  pages,
}: {
  streamingText: string;
  streamingToolCalls: StreamingToolCall[];
  pages?: PageInfo[];
}): React.JSX.Element {
  const hasTools = streamingToolCalls.length > 0;
  const hasText = streamingText.length > 0;

  if (!hasTools && !hasText) {
    return <ThinkingIndicator />;
  }

  return (
    <div className="w-full">
      {streamingToolCalls.map((tc) => {
        const label = resolveToolLabel(
          tc.toolName,
          (tc.input ?? {}) as Record<string, unknown>,
          pages,
        );
        return <ToolLine key={tc.toolCallId} label={label} isActive={tc.status === 'calling'} />;
      })}

      {!hasText && hasTools && streamingToolCalls.every((tc) => tc.status === 'completed') && (
        <ThinkingIndicator />
      )}

      {hasText && (
        <div className="w-full pt-1">
          <StreamingMarkdown text={streamingText} isStreaming />
        </div>
      )}
    </div>
  );
}
