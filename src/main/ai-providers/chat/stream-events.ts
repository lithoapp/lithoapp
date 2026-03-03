import type { ChatErrorType, StoredMessage } from '../../../shared/types';
import { parseError } from './run-chat';

export type { ChatErrorType };

// ---------------------------------------------------------------------------
// Chat stream event types (emitted to renderer via IPC)
// ---------------------------------------------------------------------------

export type ChatStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'source'; source: unknown }
  | { type: 'error'; errorType: ChatErrorType; message: string; retryAfter?: number }
  | {
      type: 'finish';
      finishReason: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        contextWindow?: number;
      };
      responseMessages: StoredMessage[];
    };

// ---------------------------------------------------------------------------
// Map ai-sdk stream part → ChatStreamEvent
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: ai-sdk TextStreamPart is a wide union
export function mapStreamPart(part: any): ChatStreamEvent | null {
  switch (part.type) {
    case 'text-delta':
      return { type: 'text-delta', text: part.text };
    case 'reasoning-delta':
      return { type: 'reasoning-delta', text: part.text };
    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      };
    case 'tool-result':
      return {
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: part.output,
      };
    case 'source':
      return { type: 'source', source: part };
    case 'error': {
      const parsed = parseError(part.error);
      return { type: 'error', ...parsed };
    }
    default:
      return null;
  }
}
