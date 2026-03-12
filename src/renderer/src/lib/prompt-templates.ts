import Mustache from 'mustache';
import designSystemKickoff from '../../../agents/design-system/kickoff.md?raw';
import designSystemSystem from '../../../agents/design-system/system.md?raw';
import documentKickoff from '../../../agents/document/kickoff.md?raw';
import documentSystem from '../../../agents/document/system.md?raw';
import workspaceKickoff from '../../../agents/workspace/kickoff.md?raw';
import workspaceSystem from '../../../agents/workspace/system.md?raw';

export function renderTemplate(template: string, vars: object): string {
  return Mustache.render(template, vars).trim();
}

export const promptTemplates = {
  'design-system': {
    system: designSystemSystem,
    kickoff: designSystemKickoff,
  },
  document: {
    system: documentSystem,
    kickoff: documentKickoff,
  },
  workspace: {
    system: workspaceSystem,
    kickoff: workspaceKickoff,
  },
};
