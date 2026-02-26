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
        const status: ToolStatus = part.state.status;
        const input = (part.state.input as Record<string, unknown>) ?? {};
        const label = resolveToolLabel(part.tool, input);
        step.tools.push({
          id: part.id,
          tool: part.tool,
          status,
          label: label.label,
          icon: label.icon,
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
