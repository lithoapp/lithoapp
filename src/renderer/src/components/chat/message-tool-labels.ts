export type ToolIcon = 'search' | 'eye' | 'pencil' | 'plus' | 'error' | 'terminal';

export interface ToolLabel {
  label: string;
  icon: ToolIcon;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract page number from a pageId like "page-3" → "3" */
function pageNumber(pageId: string): string {
  return pageId.replace(/^page-/, '');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveToolLabel(tool: string, input: Record<string, unknown>): ToolLabel {
  const pageId = input.pageId as string | undefined;

  switch (tool) {
    case 'listPages':
      return { label: 'Listing pages', icon: 'search' };

    case 'readPage':
      return {
        label: pageId ? `Reading page ${pageNumber(pageId)}` : 'Reading a page',
        icon: 'eye',
      };

    case 'writePage':
      return {
        label: pageId ? `Writing page ${pageNumber(pageId)}` : 'Writing a page',
        icon: 'pencil',
      };

    case 'editPage':
      return {
        label: pageId ? `Editing page ${pageNumber(pageId)}` : 'Editing a page',
        icon: 'pencil',
      };

    case 'createPage':
      return { label: 'Adding a new page', icon: 'plus' };

    case 'deletePage':
      return {
        label: pageId ? `Removing page ${pageNumber(pageId)}` : 'Removing a page',
        icon: 'error',
      };

    case 'readMainCss':
      return { label: 'Reading styles', icon: 'eye' };

    case 'writeMainCss':
      return { label: 'Writing styles', icon: 'pencil' };

    case 'editMainCss':
      return { label: 'Editing styles', icon: 'pencil' };

    default:
      return { label: tool, icon: 'terminal' };
  }
}

export function summarizeStep(labels: string[]): string {
  if (labels.length === 0) return 'Thinking';
  if (labels.length === 1) return labels[0];
  return labels.join(', ');
}
