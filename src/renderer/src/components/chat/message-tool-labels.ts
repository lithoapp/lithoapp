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

    case 'updatePageDetails':
      return { label: 'Updating page details', icon: 'pencil' };

    case 'movePage': {
      const pageLabel = resolvePageLabel(input.pageId as string | undefined, pages);
      const targetLabel = resolvePageLabel(input.targetPageId as string | undefined, pages);
      const position = input.position as 'before' | 'after' | undefined;
      if (pageLabel && targetLabel) {
        return {
          label: `Moving page ${pageLabel} ${position ?? ''} ${targetLabel}`,
          icon: 'pencil',
        };
      }
      return { label: 'Reordering page', icon: 'pencil' };
    }

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
    if (index !== -1) {
      const page = pages[index];
      const num = index + 1;
      return page.name ? `${num} (${page.name})` : String(num);
    }
  }
  return pageId.slice(0, 6);
}
