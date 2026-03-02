import type { Tool } from 'ai';
import Mustache from 'mustache';
import designSystemKickoffRaw from '../../../agents/design-system/kickoff.md?raw';
import designSystemPromptRaw from '../../../agents/design-system/prompt.md?raw';
import designSystemSystemRaw from '../../../agents/design-system/system.md?raw';
import documentKickoffRaw from '../../../agents/document/kickoff.md?raw';
import documentPromptRaw from '../../../agents/document/prompt.md?raw';
import documentSystemRaw from '../../../agents/document/system.md?raw';
import type { AgentContext, AgentId } from '../../../shared/types';
import type { LithoToolName } from './litho-tools';
import { createLithoTools } from './litho-tools';

interface AgentConfig {
  tools: LithoToolName[];
  systemTemplate: string;
  kickoffTemplate: string;
}

// ---------------------------------------------------------------------------
// Agent configs — mirrors permissions from agents/{design-system,document}/config.ts
// ---------------------------------------------------------------------------

const AGENTS: Record<AgentId, AgentConfig> = {
  'design-system': {
    tools: [
      'readMainCss',
      'writeMainCss',
      'editMainCss',
      'listPages',
      'readPage',
      'writePage',
      'editPage',
      'createPage',
      'deletePage',
      'updatePageDetails',
      'movePage',
    ],
    systemTemplate: `${designSystemSystemRaw}\n\n${designSystemPromptRaw}`,
    kickoffTemplate: designSystemKickoffRaw,
  },
  document: {
    tools: [
      'listPages',
      'readPage',
      'writePage',
      'editPage',
      'readMainCss',
      'createPage',
      'deletePage',
      'updatePageDetails',
      'movePage',
    ],
    systemTemplate: `${documentSystemRaw}\n\n${documentPromptRaw}`,
    kickoffTemplate: documentKickoffRaw,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAgentConfig(agentId: AgentId): AgentConfig {
  return AGENTS[agentId];
}

export function resolveAgentTools(agentId: AgentId, workspace: string): Record<string, Tool> {
  const allTools = createLithoTools(workspace);
  const allowed = AGENTS[agentId].tools;
  const filtered: Record<string, Tool> = {};
  for (const name of allowed) {
    filtered[name] = allTools[name];
  }
  return filtered;
}

export function renderSystemPrompt(agentId: AgentId, context: AgentContext): string {
  return Mustache.render(AGENTS[agentId].systemTemplate, context);
}

export function renderKickoff(agentId: AgentId, context: AgentContext): string {
  return Mustache.render(AGENTS[agentId].kickoffTemplate, context);
}
