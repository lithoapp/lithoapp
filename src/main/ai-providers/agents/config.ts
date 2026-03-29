import type { Tool } from 'ai';
import Mustache from 'mustache';
import designSystemKickoffRaw from '../../../agents/design-system/kickoff.md?raw';
import designSystemSystemRaw from '../../../agents/design-system/system.md?raw';
import documentKickoffRaw from '../../../agents/document/kickoff.md?raw';
import documentSystemRaw from '../../../agents/document/system.md?raw';
import workspaceKickoffRaw from '../../../agents/workspace/kickoff.md?raw';
import workspaceSystemRaw from '../../../agents/workspace/system.md?raw';
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
      'updateDocumentDescription',
      'listDocuments',
      'grepPages',
      'listWorkspaceAssets',
      'exportPage',
      'exportDocument',
    ],
    systemTemplate: designSystemSystemRaw,
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
      'updateDocumentDescription',
      'listDocuments',
      'grepPages',
      'listWorkspaceAssets',
      'listDocumentAssets',
      'exportPage',
      'exportDocument',
    ],
    systemTemplate: documentSystemRaw,
    kickoffTemplate: documentKickoffRaw,
  },
  workspace: {
    tools: [
      'listDocuments',
      'listPages',
      'readPage',
      'readMainCss',
      'grepPages',
      'listWorkspaceAssets',
      'listDocumentAssets',
      'createDocument',
      'updateDocumentSize',
      'deleteDocument',
      'renameDocument',
      'moveDocumentToFolder',
      'duplicateDocument',
      'updateDocumentDescription',
      'exportPage',
      'exportDocument',
    ],
    systemTemplate: workspaceSystemRaw,
    kickoffTemplate: workspaceKickoffRaw,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAgentConfig(agentId: AgentId): AgentConfig {
  return AGENTS[agentId];
}

export function resolveAgentTools(agentId: AgentId, workspace: string): Record<string, Tool> {
  const allTools = createLithoTools(workspace, agentId);
  const allowed = AGENTS[agentId].tools;
  const filtered: Record<string, Tool> = {};
  for (const name of allowed) {
    filtered[name] = allTools[name];
  }
  return filtered;
}

export function renderSystemPrompt(
  agentId: AgentId,
  context: AgentContext,
  modelId?: string,
): string {
  let prompt = Mustache.render(AGENTS[agentId].systemTemplate, context);

  if (modelId?.toLowerCase().includes('trinity')) {
    prompt +=
      '\n\nUse exactly one tool per assistant message. After each tool call, wait for the result before continuing.';
  }

  return prompt;
}

export function renderKickoff(agentId: AgentId, context: AgentContext): string {
  return Mustache.render(AGENTS[agentId].kickoffTemplate, context);
}
