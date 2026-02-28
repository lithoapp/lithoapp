import { AlertTriangle } from 'lucide-react';
import NodeRenderer, { setCustomComponents } from 'markstream-react';
import 'markstream-react/index.css';
import type { ChatMessage } from '@/hooks/use-chat';
import { isDiagnosticMessage, stripDiagnosticPrefix } from '@/hooks/use-post-turn-diagnostics';

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

export function UserMessageView({ message }: { message: ChatMessage }): React.JSX.Element {
  const firstText = message.parts.find((p) => p.type === 'text');
  const isDiagnostic = firstText?.type === 'text' && isDiagnosticMessage(firstText.text);

  if (isDiagnostic) {
    return <DiagnosticMessageView message={message} />;
  }

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagnostic message — system-style bubble for auto-injected validation errors
// ---------------------------------------------------------------------------

function DiagnosticMessageView({ message }: { message: ChatMessage }): React.JSX.Element {
  const textParts = message.parts.filter((p) => p.type === 'text');
  const fullText = textParts.map((p) => (p.type === 'text' ? p.text : '')).join('');
  const displayText = stripDiagnosticPrefix(fullText);

  // Derive label from first line: "Page build found 2 error(s):" → "Page build — 2 error(s)"
  const firstLine = displayText.split('\n')[0];
  const countMatch = firstLine.match(/(\d+)\s+error/);
  const errorCount = countMatch ? Number(countMatch[1]) : 0;
  const category = firstLine.replace(/\s+found\s+\d+.*$/, '');
  const label =
    errorCount > 0
      ? `${category} — ${errorCount} error(s) reported to agent`
      : 'Validation errors reported to agent';

  return (
    <div className="w-full flex flex-col items-end gap-0.5 pt-2">
      <div className="max-w-[85%] rounded-xl border border-muted-foreground/20 bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-1.5 pb-1">
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground/80">
          {displayText}
        </p>
      </div>
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
