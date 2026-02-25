import type { ToolState } from '@opencode-ai/sdk/client';
import type { ChatMessage } from '@/lib/opencode-types';
import { resolveToolLabel, type ToolIcon } from './message-tool-labels';

export type { ToolIcon };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ResolvedTool {
  id: string;
  tool: string;
  status: ToolStatus;
  label: string;
  icon: ToolIcon;
  rawTitle: string;
}

export interface Step {
  reasoning: string;
  tools: ResolvedTool[];
  text: string;
  status: 'active' | 'completed';
  finishReason?: string;
  cost: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function extractToolInfo(state: ToolState): { status: ToolStatus; title: string } {
  switch (state.status) {
    case 'pending':
      return { status: 'pending', title: '' };
    case 'running':
      return { status: 'running', title: state.title ?? '' };
    case 'completed':
      return { status: 'completed', title: state.title };
    case 'error':
      return { status: 'error', title: '' };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseStep(message: ChatMessage): Step {
  const step: Step = {
    reasoning: '',
    tools: [],
    text: '',
    status: 'active',
    cost: 0,
  };

  for (const part of message.parts) {
    switch (part.type) {
      case 'reasoning':
        step.reasoning += part.text;
        break;
      case 'text':
        if (step.text) step.text += '\n';
        step.text += part.text;
        break;
      case 'tool': {
        const info = extractToolInfo(part.state);
        const label = resolveToolLabel(part.tool, info.title);
        step.tools.push({
          id: part.id,
          tool: part.tool,
          status: info.status,
          label: label.label,
          icon: label.icon,
          rawTitle: info.title,
        });
        break;
      }
      case 'step-finish':
        step.status = 'completed';
        step.finishReason = part.reason;
        step.cost = part.cost;
        break;
      default:
        break;
    }
  }

  return step;
}
