import {
  AlertCircle,
  Brain,
  Check,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  Terminal,
} from 'lucide-react';
import type { ChatMessage } from '@/hooks/use-chat';
import type { PageInfo } from '../../../../shared/types';
import { StreamingMarkdown } from './message-list';
import { parseStep, type ToolIcon } from './message-parts';
import { summarizeStep } from './message-tool-labels';

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
// Status Line — most minimal: one rolling line per step
// ---------------------------------------------------------------------------

export function StatusLine({
  message,
  isStreaming,
  pages,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  pages?: PageInfo[];
}): React.JSX.Element {
  const step = parseStep(message, pages);
  const isActive = step.status === 'active';
  const hasTools = step.tools.length > 0;
  const hasText = Boolean(step.text);

  // Empty or only reasoning — show thinking
  if (message.parts.length === 0 || (!hasTools && !hasText && isActive)) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground animate-pulse">
        <Brain className="h-3 w-3" />
        <span>Thinking…</span>
      </div>
    );
  }

  // Active step with tools but no text yet — show current action
  if (isActive && hasTools && !hasText) {
    const current =
      step.tools.find((t) => t.status === 'running' || t.status === 'pending') ??
      step.tools[step.tools.length - 1];
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>{current.label}…</span>
      </div>
    );
  }

  // Completed step with only tools — faded single-line summary
  if (!hasText) {
    const labels = step.tools.map((t) => t.label);
    const mainIcon = step.tools[0]?.icon ?? 'terminal';
    const Icon = ICON_MAP[mainIcon];
    return (
      <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground/50">
        <Icon className="h-2.5 w-2.5" />
        <span>{summarizeStep(labels)}</span>
      </div>
    );
  }

  // Has text — render it, with optional tool summary above
  return (
    <div className="w-full">
      {hasTools && (
        <div className="flex items-center gap-1.5 py-0.5 text-[11px] text-muted-foreground/50">
          <Check className="h-2.5 w-2.5" />
          <span>{summarizeStep(step.tools.map((t) => t.label))}</span>
        </div>
      )}
      <div className="w-full pt-0.5">
        <StreamingMarkdown text={step.text} isStreaming={isStreaming ?? false} />
      </div>
    </div>
  );
}
