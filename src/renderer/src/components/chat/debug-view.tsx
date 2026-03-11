import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  AgentContext,
  AgentId,
  StoredAssistantMessage,
  StoredMessage,
  StoredToolMessage,
} from '../../../../shared/types';
import { promptTemplates, renderTemplate } from '../../lib/prompt-templates';
import type { StreamingPart, StreamingToolCallPart } from './types';

// ---------------------------------------------------------------------------
// Collapsible JSON block
// ---------------------------------------------------------------------------

function JsonBlock({
  label,
  data,
  defaultOpen = false,
}: {
  label: string;
  data: unknown;
  defaultOpen?: boolean;
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const json = JSON.stringify(data, null, 2);
  const lineCount = json.split('\n').length;

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
        {!isOpen && (
          <span className="text-muted-foreground/60 font-normal">({lineCount} lines)</span>
        )}
      </button>
      {isOpen && (
        <pre className="mt-1 ml-4 rounded bg-muted/50 p-2 text-[11px] leading-tight text-muted-foreground whitespace-pre-wrap break-all">
          {json}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt header (system prompt + kickoff)
// ---------------------------------------------------------------------------

function PromptHeader({
  agentId,
  agentContext,
}: {
  agentId: AgentId;
  agentContext: AgentContext;
}): React.JSX.Element {
  const systemPrompt = useMemo(
    () => renderTemplate(promptTemplates[agentId].system, agentContext),
    [agentId, agentContext],
  );
  const kickoff = useMemo(
    () => renderTemplate(promptTemplates[agentId].kickoff, agentContext),
    [agentId, agentContext],
  );

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/50 pb-3 mb-3">
      <TextBlock label="System Prompt" text={systemPrompt} />
      <TextBlock label="Kickoff Message" text={kickoff} />
    </div>
  );
}

function TextBlock({ label, text }: { label: string; text: string }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const lineCount = text.split('\n').length;

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
        {!isOpen && (
          <span className="text-muted-foreground/60 font-normal">({lineCount} lines)</span>
        )}
      </button>
      {isOpen && (
        <pre className="mt-1 ml-4 max-h-64 overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-tight text-muted-foreground whitespace-pre-wrap break-words">
          {text}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tool call card
// ---------------------------------------------------------------------------

function ToolCallCard({
  toolName,
  input,
  output,
  status,
}: {
  toolName: string;
  input: unknown;
  output?: unknown;
  status?: 'calling' | 'completed';
}): React.JSX.Element {
  return (
    <div className="rounded border border-border/50 bg-muted/20 p-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-mono font-semibold text-foreground">{toolName}</span>
        {status === 'calling' && (
          <span className="text-[10px] text-amber-500 font-medium">calling…</span>
        )}
      </div>
      <JsonBlock label="Input" data={input} defaultOpen />
      {output !== undefined && <JsonBlock label="Output" data={output} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persisted debug view
// ---------------------------------------------------------------------------

export function PersistedDebugView({
  messages,
  agentId,
  agentContext,
}: {
  messages: StoredMessage[];
  agentId?: AgentId;
  agentContext?: AgentContext;
}): React.JSX.Element {
  // Build a map of toolCallId → output from tool messages
  const outputMap = new Map<string, unknown>();
  for (const msg of messages) {
    if (msg.role !== 'tool') continue;
    const toolMsg = msg as StoredToolMessage;
    for (const part of toolMsg.content) {
      if (part.type === 'tool-result') {
        outputMap.set(part.toolCallId, part.output);
      }
    }
  }

  // Render assistant messages with their tool calls
  const assistantMessages = messages.filter(
    (m): m is StoredAssistantMessage => m.role === 'assistant',
  );

  return (
    <div className="flex flex-col gap-2">
      {agentId && agentContext && <PromptHeader agentId={agentId} agentContext={agentContext} />}
      {assistantMessages.map((msg, mi) => {
        if (typeof msg.content === 'string') {
          return (
            <div key={`text-${String(mi)}`} className="text-[11px] text-muted-foreground">
              {msg.content}
            </div>
          );
        }

        return msg.content.map((part, pi) => {
          if (part.type === 'tool-call') {
            const call = part as { toolCallId: string; toolName: string; input: unknown };
            return (
              <ToolCallCard
                key={call.toolCallId}
                toolName={call.toolName}
                input={call.input}
                output={outputMap.get(call.toolCallId)}
              />
            );
          }
          if (part.type === 'reasoning') {
            const text = (part as { text: string }).text;
            if (!text) return null;
            return (
              <div
                key={`reasoning-${String(mi)}-${String(pi)}`}
                className="rounded border border-amber-500/30 bg-amber-500/5 p-2"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                  Reasoning
                </span>
                <pre className="mt-1 text-[11px] leading-tight text-amber-950 whitespace-pre-wrap break-words">
                  {text}
                </pre>
              </div>
            );
          }
          if (part.type === 'text') {
            const text = (part as { text: string }).text;
            if (!text) return null;
            return (
              <div
                key={`text-${String(mi)}-${String(pi)}`}
                className="text-[11px] text-muted-foreground whitespace-pre-wrap"
              >
                {text}
              </div>
            );
          }
          return null;
        });
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming debug view
// ---------------------------------------------------------------------------

export function StreamingDebugView({
  streamingParts,
  agentId,
  agentContext,
}: {
  streamingParts: StreamingPart[];
  agentId?: AgentId;
  agentContext?: AgentContext;
}): React.JSX.Element {
  if (streamingParts.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {agentId && agentContext && <PromptHeader agentId={agentId} agentContext={agentContext} />}
        <div className="text-[11px] text-muted-foreground">Thinking…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {agentId && agentContext && <PromptHeader agentId={agentId} agentContext={agentContext} />}
      {streamingParts.map((part, i) => {
        if (part.type === 'tool-call') {
          const tc = part as StreamingToolCallPart;
          return (
            <ToolCallCard
              key={tc.toolCallId}
              toolName={tc.toolName}
              input={tc.input}
              output={tc.output}
              status={tc.status}
            />
          );
        }
        if (part.type === 'reasoning') {
          return (
            <div
              key={`reasoning-${String(i)}`}
              className="rounded border border-amber-500/30 bg-amber-500/5 p-2"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                Reasoning
              </span>
              <pre className="mt-1 text-[11px] leading-tight text-amber-200/80 whitespace-pre-wrap break-words">
                {part.text}
              </pre>
            </div>
          );
        }
        return (
          <div
            key={`text-${String(i)}`}
            className="text-[11px] text-muted-foreground whitespace-pre-wrap"
          >
            {part.text}
          </div>
        );
      })}
    </div>
  );
}
