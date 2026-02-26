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
// Debug view — shows raw parts in arrival order, click to expand
// ---------------------------------------------------------------------------

export function MessageDebug({
  message,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}): React.JSX.Element {
  return (
    <pre className="w-full overflow-x-auto rounded-lg border border-dashed border-muted-foreground/30 p-2 my-1 font-mono text-[10px] leading-snug text-foreground/80 whitespace-pre-wrap break-all">
      {JSON.stringify(message, null, 2)}
    </pre>
  );
}
