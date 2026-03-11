export type DisplayMode = 'activity' | 'debug';

export interface StreamingTextPart {
  type: 'text';
  text: string;
}

export interface StreamingReasoningPart {
  type: 'reasoning';
  text: string;
}

export interface StreamingToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  status: 'calling' | 'completed';
  output?: unknown;
}

export type StreamingPart = StreamingTextPart | StreamingReasoningPart | StreamingToolCallPart;
