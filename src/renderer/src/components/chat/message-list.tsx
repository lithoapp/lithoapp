import { Brain, Loader2, RotateCcw, Terminal } from 'lucide-react';
import NodeRenderer, { setCustomComponents } from 'markstream-react';
import 'markstream-react/index.css';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ChatMessage } from '@/hooks/use-chat';

// ---------------------------------------------------------------------------
// Hex color detection — renders inline color pills
// ---------------------------------------------------------------------------

const HEX_EXACT_RE = /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i;
const HEX_SPLIT_RE = /(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3}))(?=[^0-9a-f]|$)/gi;

function ColorPill({ color }: { color: string }): React.JSX.Element {
  return (
    <span className="color-pill">
      <span className="color-pill-swatch" style={{ backgroundColor: color }} />
      {color.toLowerCase()}
    </span>
  );
}

function CustomInlineCode({
  node,
}: {
  node: { type: 'inline_code'; code: string };
}): React.JSX.Element {
  const code = node.code.trim();
  if (HEX_EXACT_RE.test(code)) {
    return <ColorPill color={code} />;
  }
  return <code className="inline-code">{node.code}</code>;
}

function CustomText({
  node,
}: {
  node: { type: 'text'; content: string; center?: boolean };
}): React.JSX.Element {
  const { content, center } = node;
  const className = center ? 'text-node text-node-center' : 'text-node';
  const segments = content.split(HEX_SPLIT_RE);

  if (segments.length === 1) {
    return <span className={className}>{content}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, i) =>
        HEX_EXACT_RE.test(segment) ? (
          <ColorPill key={`${segment}-${String(i)}`} color={segment} />
        ) : (
          segment
        ),
      )}
    </span>
  );
}

setCustomComponents({
  inline_code: CustomInlineCode,
  text: CustomText,
});

// ---------------------------------------------------------------------------

function getPartRecord(part: { id: string; type: string }): Record<string, unknown> {
  return part as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Part renderers
// ---------------------------------------------------------------------------

function StreamingMarkdown({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}): React.JSX.Element {
  return (
    <div className="markdown-stream text-base">
      <NodeRenderer
        content={text}
        final={!isStreaming}
        isDark
        renderCodeBlocksAsPre
        typewriter={false}
        maxLiveNodes={0}
        renderBatchSize={40}
        renderBatchDelay={16}
      />
    </div>
  );
}

function TextPartView({
  text,
  isUser,
  isStreaming,
}: {
  text: string;
  isUser?: boolean;
  isStreaming?: boolean;
}): React.JSX.Element {
  if (isUser) {
    return <p className="whitespace-pre-wrap break-words text-base">{text}</p>;
  }
  return <StreamingMarkdown text={text} isStreaming={isStreaming ?? false} />;
}

// ---------------------------------------------------------------------------
// Pill components — inline chips for tool calls and thinking
// ---------------------------------------------------------------------------

function ToolPill({ part }: { part: Record<string, unknown> }): React.JSX.Element {
  const toolName = (part.tool as string) ?? 'unknown';
  const stateRaw = part.state;
  const status =
    typeof stateRaw === 'string'
      ? stateRaw
      : stateRaw && typeof stateRaw === 'object' && 'status' in stateRaw
        ? String((stateRaw as Record<string, unknown>).status)
        : '';
  const isRunning = status === 'running' || status === 'pending';

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
        >
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Terminal className="h-2.5 w-2.5" />
          )}
          <span>{toolName}</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {toolName}
            {status && (
              <Badge variant="outline" className="text-[10px]">
                {status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 text-xs font-mono">
          {JSON.stringify(part, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

function ThinkingPill(): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-400 animate-pulse">
      <Brain className="h-2.5 w-2.5" />
      <span>Thinking...</span>
    </span>
  );
}

function ThoughtPill({ text }: { text: string }): React.JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-500/20 dark:text-violet-400"
        >
          <Brain className="h-2.5 w-2.5" />
          <span>Thought</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-violet-500" />
            Thought
          </DialogTitle>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs font-mono">
          {text}
        </pre>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Message view
// ---------------------------------------------------------------------------

export function MessageView({
  message,
  snapshotId,
  onRevert,
  isStreaming,
}: {
  message: ChatMessage;
  snapshotId?: string;
  onRevert?: () => void;
  isStreaming?: boolean;
}): React.JSX.Element {
  const isUser = message.info.role === 'user';

  if (isUser) {
    return (
      <div className="w-full flex flex-col items-end gap-0.5 pt-2">
        <div className="max-w-[80%] rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground">
          {message.parts.map((part) => (
            <TextPartView key={part.id} text={(getPartRecord(part).text as string) ?? ''} isUser />
          ))}
        </div>
        {snapshotId && onRevert && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Revert
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revert changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  Files will be restored to before this message and the subsequent chat history will
                  be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRevert}>Revert</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    );
  }

  // Collect reasoning text
  const reasoningText = message.parts
    .filter((p) => p.type === 'reasoning')
    .map((p) => getPartRecord(p).text as string)
    .filter(Boolean)
    .join('');
  const hasVisibleContent = message.parts.some((p) => p.type === 'text' || p.type === 'tool');

  // Build pill items: thinking/thought + tool calls in order
  const pills: React.JSX.Element[] = [];
  const hasReasoning = message.parts.some((p) => p.type === 'reasoning');
  let thoughtPillAdded = false;

  for (const part of message.parts) {
    // Insert thought/thinking pill before the first non-reasoning part, or at first reasoning part
    if (!thoughtPillAdded && (part.type === 'reasoning' || part.type === 'tool')) {
      if (hasReasoning) {
        if (hasVisibleContent && reasoningText) {
          pills.push(<ThoughtPill key="thought" text={reasoningText} />);
        } else {
          pills.push(<ThinkingPill key="thinking" />);
        }
        thoughtPillAdded = true;
      }
    }
    if (part.type === 'tool') {
      pills.push(<ToolPill key={part.id} part={getPartRecord(part)} />);
    }
  }

  // If only reasoning parts exist and we haven't added the pill yet
  if (!thoughtPillAdded && hasReasoning) {
    if (hasVisibleContent && reasoningText) {
      pills.unshift(<ThoughtPill key="thought" text={reasoningText} />);
    } else {
      pills.unshift(<ThinkingPill key="thinking" />);
    }
  }

  // If message exists but has no parts yet, show thinking
  if (!thoughtPillAdded && !hasVisibleContent && message.parts.length === 0) {
    pills.push(<ThinkingPill key="thinking" />);
  }

  const textParts = message.parts.filter((p) => p.type === 'text');

  return (
    <>
      {pills}
      {textParts.length > 0 && (
        <div className="w-full pt-1">
          {textParts.map((part) => (
            <TextPartView
              key={part.id}
              text={(getPartRecord(part).text as string) ?? ''}
              isStreaming={isStreaming}
            />
          ))}
        </div>
      )}
    </>
  );
}
