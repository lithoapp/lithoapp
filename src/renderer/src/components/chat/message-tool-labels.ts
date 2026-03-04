import type { PageInfo } from '../../../../shared/types';

export type ToolIcon = 'search' | 'eye' | 'pencil' | 'plus' | 'error' | 'terminal';

export interface ToolLabel {
  activeLabel: string;
  doneLabel: string;
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
      return { activeLabel: 'Listing pages', doneLabel: 'Listed pages', icon: 'search' };

    case 'readPage':
      return {
        activeLabel: pageLabel ? `Reading page ${pageLabel}` : 'Reading a page',
        doneLabel: pageLabel ? `Read page ${pageLabel}` : 'Read a page',
        icon: 'eye',
      };

    case 'writePage':
      return {
        activeLabel: pageLabel ? `Writing page ${pageLabel}` : 'Writing a page',
        doneLabel: pageLabel ? `Wrote page ${pageLabel}` : 'Wrote a page',
        icon: 'pencil',
      };

    case 'editPage':
      return {
        activeLabel: pageLabel ? `Editing page ${pageLabel}` : 'Editing a page',
        doneLabel: pageLabel ? `Edited page ${pageLabel}` : 'Edited a page',
        icon: 'pencil',
      };

    case 'createPage':
      return { activeLabel: 'Adding a new page', doneLabel: 'Added a new page', icon: 'plus' };

    case 'deletePage':
      return {
        activeLabel: pageLabel ? `Removing page ${pageLabel}` : 'Removing a page',
        doneLabel: pageLabel ? `Removed page ${pageLabel}` : 'Removed a page',
        icon: 'error',
      };

    case 'updatePageDetails':
      return {
        activeLabel: 'Updating page details',
        doneLabel: 'Updated page details',
        icon: 'pencil',
      };

    case 'movePage': {
      const movePageLabel = resolvePageLabel(input.pageId as string | undefined, pages);
      const targetLabel = resolvePageLabel(input.targetPageId as string | undefined, pages);
      const position = input.position as 'before' | 'after' | undefined;
      if (movePageLabel && targetLabel) {
        return {
          activeLabel: `Moving page ${movePageLabel} ${position ?? ''} ${targetLabel}`,
          doneLabel: `Moved page ${movePageLabel} ${position ?? ''} ${targetLabel}`,
          icon: 'pencil',
        };
      }
      return { activeLabel: 'Reordering page', doneLabel: 'Reordered page', icon: 'pencil' };
    }

    case 'readMainCss':
      return { activeLabel: 'Reading styles', doneLabel: 'Read styles', icon: 'eye' };

    case 'writeMainCss':
      return { activeLabel: 'Writing styles', doneLabel: 'Wrote styles', icon: 'pencil' };

    case 'editMainCss':
      return { activeLabel: 'Editing styles', doneLabel: 'Edited styles', icon: 'pencil' };

    case 'listDocuments':
      return { activeLabel: 'Listing documents', doneLabel: 'Listed documents', icon: 'search' };

    case 'grepPages':
      return { activeLabel: 'Searching pages', doneLabel: 'Searched pages', icon: 'search' };

    case 'updateDocumentDescription':
      return {
        activeLabel: 'Updating document description',
        doneLabel: 'Updated document description',
        icon: 'pencil',
      };

    case 'listWorkspaceAssets':
      return {
        activeLabel: 'Listing workspace assets',
        doneLabel: 'Listed workspace assets',
        icon: 'search',
      };

    case 'listDocumentAssets':
      return {
        activeLabel: 'Listing document assets',
        doneLabel: 'Listed document assets',
        icon: 'search',
      };

    default:
      return { activeLabel: tool, doneLabel: tool, icon: 'terminal' };
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
