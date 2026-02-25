import { Brain } from 'lucide-react';
import type { ChatMessage } from '@/hooks/use-chat';
import { StreamingMarkdown } from './message-list';
import { parseStep, type ResolvedTool } from './message-parts';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TimelineDot({
  isActive,
  isError,
}: {
  isActive: boolean;
  isError?: boolean;
}): React.JSX.Element {
  if (isActive) {
    return (
      <div className="relative flex h-4 w-4 items-center justify-center">
        <div className="absolute h-2.5 w-2.5 rounded-full bg-primary/30 animate-ping" />
        <div className="h-2 w-2 rounded-full bg-primary" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-4 w-4 items-center justify-center">
        <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
      </div>
    );
  }
  return (
    <div className="flex h-4 w-4 items-center justify-center">
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
    </div>
  );
}

function TimelineEntry({
  tool,
  isLast,
}: {
  tool: ResolvedTool;
  isLast: boolean;
}): React.JSX.Element {
  const isActive = tool.status === 'pending' || tool.status === 'running';
  const isError = tool.status === 'error';

  return (
    <div className="flex gap-2">
      <div className="flex flex-col items-center">
        <TimelineDot isActive={isActive} isError={isError} />
        {!isLast && <div className="w-px flex-1 bg-border min-h-[8px]" />}
      </div>
      <span
        className={`text-[11px] py-0.5 leading-tight ${isError ? 'text-destructive line-through' : 'text-muted-foreground'}`}
      >
        {tool.label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline — vertical dot timeline with icons
// ---------------------------------------------------------------------------

export function Timeline({
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

  // Empty or only reasoning — thinking dot
  if (message.parts.length === 0 || (!hasTools && !hasText && isActive)) {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <div className="relative flex h-4 w-4 items-center justify-center">
          <div className="absolute h-2.5 w-2.5 rounded-full bg-violet-500/30 animate-ping" />
          <div className="h-2 w-2 rounded-full bg-violet-500" />
        </div>
        <span className="text-xs text-muted-foreground">Thinking…</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {hasTools && (
        <div className="pl-0.5 py-0.5">
          {step.tools.map((tool, idx) => (
            <TimelineEntry
              key={tool.id}
              tool={tool}
              isLast={idx === step.tools.length - 1 && !isActive}
            />
          ))}
        </div>
      )}

      {isActive && hasTools && !hasText && (
        <div className="flex items-center gap-2 pl-0.5 py-0.5">
          <div className="flex h-4 w-4 items-center justify-center">
            <Brain className="h-3 w-3 text-violet-500 animate-pulse" />
          </div>
          <span className="text-[11px] text-muted-foreground">Thinking…</span>
        </div>
      )}

      {hasText && (
        <div className="w-full pt-1">
          <StreamingMarkdown text={step.text} isStreaming={isStreaming ?? false} />
        </div>
      )}
    </div>
  );
}
