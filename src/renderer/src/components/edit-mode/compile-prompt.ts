import type { PendingChange } from './types';

/**
 * Compile a list of pending visual edits into a structured prompt
 * for the AI agent.
 */
export function compileEditPrompt(changes: PendingChange[]): string {
  // Group changes by page
  const byPage = new Map<string, { pageName: string; changes: PendingChange[] }>();

  for (const change of changes) {
    const existing = byPage.get(change.pageId);
    if (existing) {
      existing.changes.push(change);
    } else {
      byPage.set(change.pageId, { pageName: change.pageName, changes: [change] });
    }
  }

  const sections: string[] = [];

  for (const [pageId, { pageName, changes: pageChanges }] of byPage) {
    const lines: string[] = [];
    lines.push(`## Page "${pageName}" (id: ${pageId})`);

    for (let i = 0; i < pageChanges.length; i++) {
      const change = pageChanges[i];
      const lineNum = parseLineFromLoc(change.loc);
      const lineRef = lineNum ? ` (line ${lineNum})` : '';

      if (change.type === 'text') {
        lines.push(`${i + 1}. Change text "${change.oldText}" to "${change.newText}"${lineRef}`);
      } else {
        lines.push(
          `${i + 1}. ${change.description}${lineRef}\nElement HTML:\n\`\`\`html\n${change.elementInfo.outerHtml}\n\`\`\``,
        );
      }
    }

    sections.push(lines.join('\n'));
  }

  return `Make the following visual edits:\n\n${sections.join('\n\n')}`;
}

function parseLineFromLoc(loc: string): number | undefined {
  // loc format: "pageId:line:col"
  const parts = loc.split(':');
  if (parts.length >= 2) {
    const line = Number.parseInt(parts[1], 10);
    if (!Number.isNaN(line)) return line;
  }
  return undefined;
}
