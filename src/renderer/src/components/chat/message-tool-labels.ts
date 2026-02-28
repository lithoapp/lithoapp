import type { PageInfo } from '../../../../shared/types';

export type ToolIcon = 'search' | 'eye' | 'pencil' | 'plus' | 'error' | 'terminal';

export interface ToolLabel {
  label: string;
  icon: ToolIcon;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveToolLabel(
  tool: string,
  input: Record<string, unknown>,
  pages?: PageInfo[],
): ToolLabel {
  const pageId = input.pageId as string | undefined;
  const pageLabel = resolvePageLabel(pageId, pages);

  switch (tool) {
    case 'listPages':
      return { label: 'Listing pages', icon: 'search' };

    case 'readPage':
      return {
        label: pageLabel ? `Reading page ${pageLabel}` : 'Reading a page',
        icon: 'eye',
      };

    case 'writePage':
      return {
        label: pageLabel ? `Writing page ${pageLabel}` : 'Writing a page',
        icon: 'pencil',
      };

    case 'editPage':
      return {
        label: pageLabel ? `Editing page ${pageLabel}` : 'Editing a page',
        icon: 'pencil',
      };

    case 'createPage':
      return { label: 'Adding a new page', icon: 'plus' };

    case 'deletePage':
      return {
        label: pageLabel ? `Removing page ${pageLabel}` : 'Removing a page',
        icon: 'error',
      };

    case 'updatePageDescription':
      return { label: 'Updating page description', icon: 'pencil' };

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

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function resolvePageLabel(
  pageId: string | undefined,
  pages: PageInfo[] | undefined,
): string | undefined {
  if (!pageId) return undefined;
  if (pages) {
    const index = pages.findIndex((p) => p.id === pageId);
    if (index !== -1) return String(index + 1);
  }
  return pageId.slice(0, 6);
}
