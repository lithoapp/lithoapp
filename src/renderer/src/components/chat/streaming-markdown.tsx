import NodeRenderer, { setCustomComponents } from 'markstream-react';
import 'markstream-react/index.css';

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
// Streaming markdown renderer
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
