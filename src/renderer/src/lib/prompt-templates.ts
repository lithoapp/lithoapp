import Mustache from 'mustache';
import designSystemKickoff from '../../../agents/design-system/kickoff.md?raw';
import designSystemSystem from '../../../agents/design-system/system.md?raw';
import documentKickoff from '../../../agents/document/kickoff.md?raw';
import documentSystem from '../../../agents/document/system.md?raw';

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
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
};
