import { RotateCcw } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
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
// Shared renderers (exported for use by approach components)
// ---------------------------------------------------------------------------

export function StreamingMarkdown({
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

// ---------------------------------------------------------------------------
// User message view (shared across all display modes)
// ---------------------------------------------------------------------------

export function UserMessageView({
  message,
  snapshotId,
  onRevert,
}: {
  message: ChatMessage;
  snapshotId?: string;
  onRevert?: () => void;
}): React.JSX.Element {
  return (
    <div className="w-full flex flex-col items-end gap-0.5 pt-2">
      <div className="max-w-[80%] rounded-2xl bg-primary px-3.5 py-2 text-primary-foreground">
        {message.parts
          .filter((p) => p.type === 'text')
          .map((p) => (
            <p key={p.id} className="whitespace-pre-wrap break-words text-base">
              {p.type === 'text' ? p.text : ''}
            </p>
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

// ---------------------------------------------------------------------------
// Debug view — shows raw parts in arrival order
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  text: '#22c55e',
  reasoning: '#a78bfa',
  tool: '#f59e0b',
  'step-start': '#6b7280',
  'step-finish': '#6b7280',
  snapshot: '#6b7280',
  patch: '#3b82f6',
  file: '#3b82f6',
  agent: '#ec4899',
  retry: '#ef4444',
  compaction: '#6b7280',
  subtask: '#ec4899',
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function PartSummary({ part }: { part: Record<string, unknown> }): React.JSX.Element {
  const type = part.type as string;
  const color = TYPE_COLORS[type] ?? '#9ca3af';

  let detail = '';
  switch (type) {
    case 'text':
      detail = truncate((part.text as string) ?? '', 120);
      break;
    case 'reasoning':
      detail = truncate((part.text as string) ?? '', 120);
      break;
    case 'tool': {
      const state = part.state as Record<string, unknown> | undefined;
      const status = state?.status ?? '?';
      const title = state?.title ?? '';
      detail = `${part.tool} [${String(status)}]${title ? ` — ${String(title)}` : ''}`;
      break;
    }
    case 'step-start':
      detail = part.snapshot ? `snapshot: ${String(part.snapshot).slice(0, 20)}` : '(no snapshot)';
      break;
    case 'step-finish':
      detail = `reason: ${String(part.reason ?? '?')} | cost: $${String(part.cost ?? 0)}`;
      break;
    default:
      detail = truncate(JSON.stringify(part, null, 0), 120);
  }

  return (
    <div className="flex gap-2 items-start py-0.5 font-mono text-[11px] leading-relaxed">
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-white font-semibold text-[10px]"
        style={{ backgroundColor: color }}
      >
        {type}
      </span>
      <span className="text-muted-foreground break-all">{detail}</span>
    </div>
  );
}

export function MessageDebug({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}): React.JSX.Element {
  return (
    <div className="w-full rounded-lg border border-dashed border-muted-foreground/30 p-2 my-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono text-muted-foreground">
          assistant — {message.parts.length} parts
          {isStreaming ? ' (streaming)' : ''}
        </span>
      </div>
      {message.parts.length === 0 && (
        <span className="text-[11px] text-muted-foreground italic">no parts yet</span>
      )}
      {message.parts.map((part, idx) => (
        <PartSummary
          key={part.id ?? String(idx)}
          part={part as unknown as Record<string, unknown>}
        />
      ))}
    </div>
  );
}
