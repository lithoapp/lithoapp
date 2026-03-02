export type DisplayMode = 'activity' | 'debug';

export interface StreamingToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
  status: 'calling' | 'completed';
  output?: unknown;
}
