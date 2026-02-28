import type { PageAudit, PageAuditContext, PageAuditor } from '../page-audit-types';

const TOLERANCE_PX = 1;

function findContainer(doc: Document): HTMLElement | null {
  // Note: instanceof HTMLElement fails across iframe boundaries (different
  // global constructors), so we use nodeType === 1 (ELEMENT_NODE) instead.

  // CSR: #root > first child
  const root = doc.getElementById('root');
  const rootChild = root?.firstElementChild;
  if (rootChild && rootChild.nodeType === 1) {
    return rootChild as HTMLElement;
  }
  // SSR: body > first child
  const bodyChild = doc.body?.firstElementChild;
  if (bodyChild && bodyChild.nodeType === 1) {
    return bodyChild as HTMLElement;
  }
  return null;
}

function buildFixMessage(
  pageId: string,
  pageWidthPx: number,
  pageHeightPx: number,
  overflowX: number,
  overflowY: number,
): string {
  const lines = [
    `Fix content overflow on page "${pageId}".`,
    '',
    `Page dimensions: ${Math.round(pageWidthPx)}x${Math.round(pageHeightPx)}px`,
  ];

  if (overflowX > 0) {
    lines.push(`Horizontal overflow: ${overflowX}px`);
  }
  if (overflowY > 0) {
    lines.push(`Vertical overflow: ${overflowY}px`);
  }

  lines.push(
    '',
    'Reduce content, shrink font sizes, or adjust layout so everything fits within the page bounds.',
  );

  return lines.join('\n');
}

export const overflowAuditor: PageAuditor = (
  iframe: HTMLIFrameElement,
  context: PageAuditContext,
): PageAudit[] => {
  const doc = iframe.contentDocument;
  if (!doc) {
    console.log('[overflow-auditor] no contentDocument');
    return [];
  }

  const container = findContainer(doc);
  if (!container) {
    console.log('[overflow-auditor] no container found', {
      rootEl: doc.getElementById('root'),
      bodyFirstChild: doc.body?.firstElementChild,
      bodyHTML: doc.body?.innerHTML.slice(0, 200),
    });
    return [];
  }

  const { pageId, pageWidthPx, pageHeightPx } = context;

  // scrollWidth/scrollHeight reflect actual content size even with
  // overflow:hidden — no need to modify overflow and risk layout reflow.
  const overflowX = Math.max(0, container.scrollWidth - container.clientWidth);
  const overflowY = Math.max(0, container.scrollHeight - container.clientHeight);

  console.log('[overflow-auditor] container:', {
    tag: container.tagName,
    classes: container.className,
    clientWidth: container.clientWidth,
    clientHeight: container.clientHeight,
    scrollWidth: container.scrollWidth,
    scrollHeight: container.scrollHeight,
    overflowX,
    overflowY,
    pageWidthPx,
    pageHeightPx,
  });

  if (overflowX <= TOLERANCE_PX && overflowY <= TOLERANCE_PX) {
    return [];
  }

  const dims: string[] = [];
  if (overflowX > TOLERANCE_PX) dims.push(`${overflowX}px horizontally`);
  if (overflowY > TOLERANCE_PX) dims.push(`${overflowY}px vertically`);

  return [
    {
      auditorId: 'overflow',
      severity: 'error',
      label: 'Content Overflow',
      description: `Content overflows ${dims.join(' and ')}`,
      fixMessage: buildFixMessage(pageId, pageWidthPx, pageHeightPx, overflowX, overflowY),
    },
  ];
};
