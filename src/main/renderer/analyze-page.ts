import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';

const LOAD_TIMEOUT_MS = 10_000;
const RENDER_SETTLE_MS = 300;

export interface PageLayoutAnalysis {
  contentHeight: number;
  pageHeight: number;
  emptyBottomPx: number;
  emptyBottomRatio: number;
  overflowX: number;
  overflowY: number;
}

function mmToCssPx(mm: number): number {
  return mm * 3.7795;
}

/**
 * The JS code that runs inside the hidden BrowserWindow to analyze the DOM.
 * Returned as a string so it can be passed to executeJavaScript().
 */
function buildAnalysisScript(pageWidthPx: number, pageHeightPx: number): string {
  return `
    (() => {
      const PAGE_WIDTH = ${pageWidthPx};
      const PAGE_HEIGHT = ${pageHeightPx};
      const TOLERANCE = 1;

      // Find the root container:
      // - CSR: #root > first child (React mounts inside #root)
      // - SSR: first <div> in body (SSR bodyHtml is a div wrapper; skip <link>/<script>/etc.)
      const root = document.getElementById('root');
      let container = root && root.firstElementChild;
      if (!container) {
        container = document.body.querySelector(':scope > div');
      }
      if (!container) return { error: 'no-container' };

      // Root-level overflow
      const overflowX = Math.max(0, container.scrollWidth - container.clientWidth);
      const overflowY = Math.max(0, container.scrollHeight - container.clientHeight);

      // Empty bottom: find the bottommost visible content by scanning leaf
      // elements (no child elements). Leaf elements are actual content — text,
      // images, icons, <br>, <hr> — never layout wrappers like flex/grid containers.
      const allElements = container.querySelectorAll('*');
      let maxBottom = 0;
      for (const el of allElements) {
        if (el.children.length > 0) continue;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0 && rect.width <= 0) continue;
        maxBottom = Math.max(maxBottom, rect.bottom);
      }
      // Fallback: if no leaf elements found, use the container's scrollHeight
      if (maxBottom === 0) maxBottom = container.scrollHeight;

      const emptyBottomPx = Math.max(0, PAGE_HEIGHT - maxBottom);
      const emptyBottomRatio = PAGE_HEIGHT > 0 ? emptyBottomPx / PAGE_HEIGHT : 0;

      return {
        contentHeight: Math.round(maxBottom),
        pageHeight: PAGE_HEIGHT,
        emptyBottomPx: Math.round(emptyBottomPx),
        emptyBottomRatio: Math.round(emptyBottomRatio * 100) / 100,
        overflowX: Math.round(overflowX),
        overflowY: Math.round(overflowY),
      };
    })()
  `;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Render page HTML in a hidden BrowserWindow and analyze the DOM layout.
 * Returns null if analysis fails (non-fatal — callers should gracefully skip).
 */
export async function analyzePage(
  html: string,
  approach: 'csr' | 'ssr',
  pageSize: { width: number; height: number; unit: 'mm' | 'px' },
): Promise<PageLayoutAnalysis | null> {
  const pageWidthPx = Math.round(
    pageSize.unit === 'mm' ? mmToCssPx(pageSize.width) : pageSize.width,
  );
  const pageHeightPx = Math.round(
    pageSize.unit === 'mm' ? mmToCssPx(pageSize.height) : pageSize.height,
  );

  const win = new BrowserWindow({
    width: pageWidthPx,
    height: pageHeightPx,
    show: false,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const tmpPath = join(app.getPath('temp'), `litho-analyze-${randomUUID()}.html`);
  await fs.writeFile(tmpPath, html, 'utf-8');

  try {
    await withTimeout(win.loadFile(tmpPath), LOAD_TIMEOUT_MS, 'Page load (analyze)');

    // CSR pages need time for React to mount
    if (approach === 'csr') {
      await waitForCsrReady(win);
    }

    // Let paint settle
    await new Promise((resolve) => setTimeout(resolve, RENDER_SETTLE_MS));

    const result = await win.webContents.executeJavaScript(
      buildAnalysisScript(pageWidthPx, pageHeightPx),
    );

    if (result?.error) return null;

    return result as PageLayoutAnalysis;
  } catch {
    return null;
  } finally {
    win.destroy();
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function waitForCsrReady(win: BrowserWindow): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < 5_000) {
    const childCount = await win.webContents.executeJavaScript(`
      (() => {
        const root = document.getElementById('root');
        return root ? root.children.length : -1;
      })();
    `);
    if (typeof childCount === 'number' && childCount > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Format analysis into a neutral, informational summary for AI tool responses.
 * Always returns a one-liner with key metrics. Details expand only when notable.
 */
export function formatAnalysisSummary(analysis: PageLayoutAnalysis): string {
  const fillPct = Math.round((1 - analysis.emptyBottomRatio) * 100);
  const details: string[] = [];

  const OVERFLOW_TOLERANCE = 20;

  if (analysis.overflowX > OVERFLOW_TOLERANCE) {
    details.push(`Horizontal overflow: ${analysis.overflowX}px`);
  }
  if (analysis.overflowY > OVERFLOW_TOLERANCE) {
    details.push(`Vertical overflow: ${analysis.overflowY}px`);
  }

  if (analysis.emptyBottomRatio > 0.25) {
    details.push(`${analysis.emptyBottomPx}px unused at bottom`);
  }

  const summary = `Layout: content fills ${fillPct}% of page height.`;

  if (details.length === 0) return summary;

  return `${summary}\n${details.map((d) => `- ${d}`).join('\n')}`;
}
