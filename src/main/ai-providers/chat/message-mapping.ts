import type {
  AssistantContent,
  AssistantModelMessage,
  ModelMessage,
  ToolContent,
  ToolModelMessage,
} from 'ai';
import type { StoredMessage } from '../../../shared/types';

// ---------------------------------------------------------------------------
// StoredMessage[] → ai-sdk ModelMessage[]
// ---------------------------------------------------------------------------

export function storedToModelMessages(messages: StoredMessage[]): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    switch (msg.role) {
      case 'user':
        return { role: 'user', content: msg.content };
      case 'assistant': {
        if (typeof msg.content === 'string') {
          return { role: 'assistant', content: msg.content };
        }
        const parts = msg.content.map((p) => {
          switch (p.type) {
            case 'text':
              return { type: 'text' as const, text: p.text };
            case 'reasoning':
              return { type: 'reasoning' as const, text: p.text };
            case 'tool-call':
              return {
                type: 'tool-call' as const,
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                input: p.input,
              };
            case 'tool-result':
              return {
                type: 'tool-result' as const,
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                output: p.output,
              };
            default:
              throw new Error(`Unknown part type: ${(p as { type: string }).type}`);
          }
        });
        return { role: 'assistant', content: parts as AssistantContent };
      }
      case 'tool':
        return {
          role: 'tool',
          content: msg.content.map((p) => ({
            type: 'tool-result' as const,
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            output: p.output,
          })) as ToolContent,
        };
      default:
        throw new Error(`Unknown message role: ${(msg as { role: string }).role}`);
    }
  });
}

// ---------------------------------------------------------------------------
// ai-sdk response messages → StoredMessage[]
// ---------------------------------------------------------------------------

export type ResponseMessage = AssistantModelMessage | ToolModelMessage;

export function responseToStoredMessages(messages: ResponseMessage[]): StoredMessage[] {
  return messages.map((msg): StoredMessage => {
    if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        return { role: 'assistant', content: msg.content };
      }
      const parts = msg.content
        .filter(
          (p) =>
            p.type === 'text' ||
            p.type === 'reasoning' ||
            p.type === 'tool-call' ||
            p.type === 'tool-result',
        )
        .map((p) => {
          switch (p.type) {
            case 'text':
              return { type: 'text' as const, text: p.text };
            case 'reasoning':
              return { type: 'reasoning' as const, text: p.text };
            case 'tool-call':
              return {
                type: 'tool-call' as const,
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                input: p.input,
              };
            case 'tool-result':
              return {
                type: 'tool-result' as const,
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                output: p.output,
              };
            default:
              throw new Error(`Unexpected part type: ${(p as { type: string }).type}`);
          }
        });
      return { role: 'assistant', content: parts };
    }
    if (msg.role === 'tool') {
      const content = msg.content
        .filter((p) => p.type === 'tool-result')
        .map((p) => ({
          type: 'tool-result' as const,
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          output: p.output,
        }));
      return { role: 'tool', content };
    }
    throw new Error(`Unexpected response message role: ${(msg as { role: string }).role}`);
  });
}
