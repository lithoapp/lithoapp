import type { StoredMessage } from '../../../shared/types';

// ---------------------------------------------------------------------------
// Tool result pruning — keep only the last result per resource
// ---------------------------------------------------------------------------

const PRUNED_PLACEHOLDER = '[Previous result cleared — see latest read below]';

/** Replace tool output with a placeholder, preserving the original structure. */
export function prunedOutput(original: unknown): unknown {
  if (typeof original === 'object' && original !== null && 'type' in original) {
    // Preserve the AI SDK structured format: { type: "text", value: "..." }
    return { type: 'text', value: PRUNED_PLACEHOLDER };
  }
  return PRUNED_PLACEHOLDER;
}

/**
 * Returns a deduplication key for tool results that should be pruned when
 * superseded by a later call. Returns `undefined` for tools that should
 * never be pruned.
 */
function pruneKey(toolName: string, input: unknown): string | undefined {
  switch (toolName) {
    case 'readPage':
      return `readPage:${(input as { pageId?: string })?.pageId ?? ''}`;
    case 'readMainCss':
      return 'readMainCss';
    case 'listPages':
      return 'listPages';
    default:
      return undefined;
  }
}

/** Estimate the byte size of a tool output. */
function outputSize(output: unknown): number {
  if (typeof output === 'string') return output.length;
  if (typeof output === 'object' && output !== null) {
    const obj = output as Record<string, unknown>;
    if (typeof obj.value === 'string') return (obj.value as string).length;
    if (typeof obj.text === 'string') return (obj.text as string).length;
    return JSON.stringify(output).length;
  }
  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

export interface PruneResult {
  pruneIds: Set<string>;
  stats: Map<string, { count: number; totalBytes: number }>;
}

/**
 * Scan messages to find which tool-result keys to keep (the last occurrence)
 * and which to replace with a placeholder. Also measures pruned output sizes.
 */
export function buildPruneSet(messages: StoredMessage[]): PruneResult {
  const lastCallId = new Map<string, string>();
  const callMeta = new Map<string, { toolName: string; key: string }>();

  for (const msg of messages) {
    if (msg.role === 'assistant' && typeof msg.content !== 'string') {
      for (const part of msg.content) {
        if (part.type === 'tool-call') {
          const key = pruneKey(part.toolName, part.input);
          if (key) {
            lastCallId.set(key, part.toolCallId);
            callMeta.set(part.toolCallId, { toolName: part.toolName, key });
          }
        }
      }
    }
  }

  const keepIds = new Set(lastCallId.values());
  const pruneIds = new Set<string>();

  for (const [callId] of callMeta) {
    if (!keepIds.has(callId)) {
      pruneIds.add(callId);
    }
  }

  // Measure sizes of pruned outputs
  const stats = new Map<string, { count: number; totalBytes: number }>();

  for (const msg of messages) {
    if (msg.role === 'tool') {
      for (const p of msg.content) {
        if (pruneIds.has(p.toolCallId)) {
          const meta = callMeta.get(p.toolCallId);
          const name = meta?.toolName ?? p.toolName;
          const existing = stats.get(name) ?? { count: 0, totalBytes: 0 };
          existing.count += 1;
          existing.totalBytes += outputSize(p.output);
          stats.set(name, existing);
        }
      }
    }
    if (msg.role === 'assistant' && typeof msg.content !== 'string') {
      for (const p of msg.content) {
        if (p.type === 'tool-result' && pruneIds.has(p.toolCallId)) {
          const meta = callMeta.get(p.toolCallId);
          const name = meta?.toolName ?? p.toolName;
          const existing = stats.get(name) ?? { count: 0, totalBytes: 0 };
          existing.count += 1;
          existing.totalBytes += outputSize(p.output);
          stats.set(name, existing);
        }
      }
    }
  }

  return { pruneIds, stats };
}

/** Log a summary of what was pruned. */
export function logPruneStats(pruneIds: Set<string>, stats: PruneResult['stats']): void {
  if (pruneIds.size === 0) return;

  const totalBytes = [...stats.values()].reduce((sum, s) => sum + s.totalBytes, 0);
  const breakdown = [...stats.entries()]
    .map(([name, s]) => `${name} (${s.count} × ${formatBytes(s.totalBytes)})`)
    .join(', ');
  console.log(
    `[prune] Pruning ${pruneIds.size} superseded tool results — ${formatBytes(totalBytes)} saved: ${breakdown}`,
  );
}
