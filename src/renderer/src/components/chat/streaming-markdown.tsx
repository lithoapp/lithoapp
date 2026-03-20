import NodeRenderer, { setCustomComponents } from 'markstream-react';
import { createContext, useContext } from 'react';
import 'markstream-react/index.css';
import { cn } from '@/lib/utils';
import {
  type ColorTokenMap,
  renderTextWithColorMentions,
  resolveColorMention,
} from './color-tokens';

// ---------------------------------------------------------------------------
// Color mention detection — renders inline color pills
// ---------------------------------------------------------------------------

const ColorTokenContext = createContext<ColorTokenMap>(new Map());

function ColorPill({ color, label }: { color: string; label: string }): React.JSX.Element {
  return (
    <span className="color-pill">
      <span className="color-pill-swatch" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function CustomInlineCode({
  node,
}: {
  node: { type: 'inline_code'; code: string };
}): React.JSX.Element {
  const colorTokenMap = useContext(ColorTokenContext);
  const code = node.code.trim();
  const resolvedMention = resolveColorMention(code, colorTokenMap);
  if (resolvedMention) {
    return <ColorPill color={resolvedMention.color} label={resolvedMention.label} />;
  }
  return <code className="inline-code">{node.code}</code>;
}

function CustomText({
  node,
}: {
  node: { type: 'text'; content: string; center?: boolean };
}): React.JSX.Element {
  const colorTokenMap = useContext(ColorTokenContext);
  const { content, center } = node;
  const className = center ? 'text-node text-node-center' : 'text-node';
  const segments = renderTextWithColorMentions(content, colorTokenMap, (mention, key) => (
    <ColorPill key={key} color={mention.color} label={mention.label} />
  ));

  return <span className={className}>{segments}</span>;
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
  colorTokenMap,
  className,
}: {
  text: string;
  isStreaming: boolean;
  colorTokenMap?: ColorTokenMap;
  className?: string;
}): React.JSX.Element {
  return (
    <ColorTokenContext.Provider value={colorTokenMap ?? new Map()}>
      <div className={cn('markdown-stream text-base', className)}>
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
    </ColorTokenContext.Provider>
  );
}
