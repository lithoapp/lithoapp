import { AlertCircle, Brain, Eye, Loader2, Pencil, Plus, Search, Terminal } from 'lucide-react';
import type { ChatMessage } from '@/hooks/use-chat';
import { StreamingMarkdown } from './message-list';
import { parseStep, type ResolvedTool, type ToolIcon } from './message-parts';

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

function ToolLine({ tool }: { tool: ResolvedTool }): React.JSX.Element {
  const Icon = ICON_MAP[tool.icon];
  const isActive = tool.status === 'pending' || tool.status === 'running';
  const isError = tool.status === 'error';

  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
      {isActive ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      ) : isError ? (
        <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
      ) : (
        <Icon className="h-3 w-3 shrink-0" />
      )}
      <span className={isError ? 'line-through opacity-60' : ''}>{tool.label}</span>
    </div>
  );
}

function ThinkingIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground animate-pulse">
      <Brain className="h-3 w-3 shrink-0" />
      <span>Thinking…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Log — shows each tool action as a line, text below
// ---------------------------------------------------------------------------

export function ActivityLog({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}): React.JSX.Element {
  const step = parseStep(message);
  const isActive = step.status === 'active';
  const hasTools = step.tools.length > 0;
  const hasText = Boolean(step.text);

  // Empty message — placeholder
  if (message.parts.length === 0) {
    return <ThinkingIndicator />;
  }

  // Only reasoning so far
  if (!hasTools && !hasText && isActive) {
    return <ThinkingIndicator />;
  }

  return (
    <div className="w-full">
      {step.tools.map((tool) => (
        <ToolLine key={tool.id} tool={tool} />
      ))}

      {isActive && hasTools && !hasText && <ThinkingIndicator />}

      {hasText && (
        <div className="w-full pt-1">
          <StreamingMarkdown text={step.text} isStreaming={isStreaming ?? false} />
        </div>
      )}
    </div>
  );
}
