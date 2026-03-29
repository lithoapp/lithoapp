import type { AssistantContent, ModelMessage, ToolContent } from 'ai';

const VISION_ERROR_OUTPUT = {
  type: 'error-text' as const,
  value:
    'ERROR: This model does not support vision. Use a vision-capable model to see page screenshots.',
};

function hasMediaParts(value: unknown[]): boolean {
  return value.some(
    (part) =>
      typeof part === 'object' &&
      part !== null &&
      (part as Record<string, unknown>).type === 'media',
  );
}

/** Detect image content in tool output, handling both direct and JSON-wrapped forms. */
function isImageOutput(output: unknown): boolean {
  if (typeof output !== 'object' || output === null) return false;
  const o = output as Record<string, unknown>;
  // Direct: { type: 'content', value: [{ type: 'media', ... }] }
  if (o.type === 'content' && Array.isArray(o.value)) {
    return hasMediaParts(o.value as unknown[]);
  }
  // JSON-wrapped (legacy stored messages without toModelOutput):
  // { type: 'json', value: { type: 'content', value: [...] } }
  if (o.type === 'json' && typeof o.value === 'object' && o.value !== null) {
    const inner = o.value as Record<string, unknown>;
    if (inner.type === 'content' && Array.isArray(inner.value)) {
      return hasMediaParts(inner.value as unknown[]);
    }
  }
  return false;
}

let strippedCount = 0;

const VISION_TOOLS = new Set(['viewPage', 'viewAsset']);

function stripOutput(toolName: string, output: unknown): unknown {
  if (VISION_TOOLS.has(toolName) && isImageOutput(output)) {
    strippedCount++;
    return VISION_ERROR_OUTPUT;
  }
  return output;
}

/**
 * If the model lacks vision, replace viewPage image outputs with an error string.
 * Handles both role:'tool' messages and tool-result parts in role:'assistant' messages.
 */
export function stripImagesIfNoVision(msgs: ModelMessage[], hasVision: boolean): ModelMessage[] {
  if (hasVision) return msgs;

  strippedCount = 0;

  const result = msgs.map((msg) => {
    if (msg.role === 'tool') {
      return {
        ...msg,
        content: msg.content.map((part) =>
          part.type === 'tool-result'
            ? { ...part, output: stripOutput(part.toolName, part.output) }
            : part,
        ) as ToolContent,
      };
    }
    if (msg.role === 'assistant' && typeof msg.content !== 'string') {
      return {
        ...msg,
        content: msg.content.map((part) =>
          part.type === 'tool-result'
            ? { ...part, output: stripOutput(part.toolName, part.output) }
            : part,
        ) as AssistantContent,
      };
    }
    return msg;
  });

  if (strippedCount > 0) {
    console.log(`[vision-transform] Stripped ${strippedCount} image(s) for non-vision model`);
  }

  return result;
}
