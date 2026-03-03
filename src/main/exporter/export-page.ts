import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import type { PageExportOptions } from '../../shared/types';

const PAGE_READY_TIMEOUT_MS = 15_000;
const CAPTURE_TIMEOUT_MS = 30_000;
const PAINT_SETTLE_MS = 500;

function mmToCssPx(mm: number): number {
  return mm * 3.7795;
}

function mmToDpiPx(mm: number, dpi: number): number {
  return Math.round((mm * dpi) / 25.4);
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

function log(message: string, ...args: unknown[]): void {
  console.log(`[renderer:export] ${message}`, ...args);
}

/**
 * Export a single page from an HTML string to PDF, PNG, or JPG.
 * Returns the raw buffer. If `savePath` is set, also writes to disk.
 * Uses a hidden BrowserWindow for capture.
 */
export async function exportPage(options: PageExportOptions): Promise<Buffer> {
  const { html, approach, format, size, dpi, jpgQuality, savePath } = options;

  const cssPxWidth = size.unit === 'mm' ? mmToCssPx(size.width) : size.width;
  const cssPxHeight = size.unit === 'mm' ? mmToCssPx(size.height) : size.height;

  const isPdf = format === 'pdf';

  const targetWidth = isPdf
    ? Math.round(cssPxWidth)
    : size.unit === 'mm'
      ? mmToDpiPx(size.width, dpi)
      : size.width;
  const targetHeight = isPdf
    ? Math.round(cssPxHeight)
    : size.unit === 'mm'
      ? mmToDpiPx(size.height, dpi)
      : size.height;

  const zoomFactor = isPdf ? 1 : targetWidth / cssPxWidth;

  log(`Creating capture window ${targetWidth}x${targetHeight}, zoom=${zoomFactor.toFixed(3)}`);

  const win = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    show: false,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Write HTML to a temp file — data URIs hit Chromium's ~2MB URL length limit
  // when the HTML contains large inlined CSS (e.g. Tailwind).
  const tmpPath = join(app.getPath('temp'), `litho-export-${randomUUID()}.html`);
  await fs.writeFile(tmpPath, html, 'utf-8');

  try {
    log('Loading HTML from temp file');
    await withTimeout(win.loadFile(tmpPath), CAPTURE_TIMEOUT_MS, 'Page load');

    // CSR: poll for React to mount into #root. SSR: static HTML is ready on load.
    if (approach === 'csr') {
      await waitForCsrReady(win);
    }

    // Paint settle
    log(`Waiting ${PAINT_SETTLE_MS}ms for paint settle`);
    await new Promise((resolve) => setTimeout(resolve, PAINT_SETTLE_MS));

    // Hide scrollbars
    await win.webContents.executeJavaScript(`
      (() => {
        const s = document.createElement('style');
        s.textContent = '::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
        document.head.appendChild(s);
      })();
    `);

    // PDF export: fix box-shadow rendering (Chromium bug crbug.com/174583)
    // Workaround: -webkit-filter: blur(0) forces proper shadow rasterization
    // See: https://github.com/puppeteer/puppeteer/issues/5284
    if (isPdf) {
      await win.webContents.executeJavaScript(`
        (() => {
          const s = document.createElement('style');
          s.textContent = '[style*="box-shadow"],[class*="shadow"] { -webkit-print-color-adjust: exact; -webkit-filter: blur(0); }';
          document.head.appendChild(s);
        })();
      `);
    }

    let buffer: Buffer;

    if (isPdf) {
      const cssWidth = size.unit === 'mm' ? `${size.width}mm` : `${size.width / 96}in`;
      const cssHeight = size.unit === 'mm' ? `${size.height}mm` : `${size.height / 96}in`;
      log(`Injecting @page { size: ${cssWidth} ${cssHeight}; margin: 0 }`);
      await win.webContents.executeJavaScript(`
        (() => {
          const s = document.createElement('style');
          s.textContent = '@page { size: ${cssWidth} ${cssHeight}; margin: 0; }';
          document.head.appendChild(s);
        })();
      `);

      log('Calling printToPDF');
      const pdfBuffer = await withTimeout(
        win.webContents.printToPDF({
          margins: { marginType: 'none' },
          printBackground: true,
          preferCSSPageSize: true,
          scale: 1,
        }),
        CAPTURE_TIMEOUT_MS,
        'printToPDF',
      );
      buffer = Buffer.from(pdfBuffer);
    } else {
      // Apply zoom for image capture
      if (zoomFactor !== 1) {
        log(`Setting zoom factor to ${zoomFactor.toFixed(3)}`);
        win.webContents.setZoomFactor(zoomFactor);
        await new Promise((resolve) => setTimeout(resolve, PAINT_SETTLE_MS));
      }

      log('Calling capturePage');
      let image = await win.webContents.capturePage();

      // Resize for HiDPI
      const captured = image.getSize();
      log(`Captured ${captured.width}x${captured.height}, target ${targetWidth}x${targetHeight}`);
      if (captured.width !== targetWidth || captured.height !== targetHeight) {
        image = image.resize({ width: targetWidth, height: targetHeight });
      }

      buffer = format === 'jpg' ? image.toJPEG(jpgQuality) : image.toPNG();
    }

    if (savePath) {
      await fs.writeFile(savePath, buffer);
      log(`Exported ${format.toUpperCase()} to ${savePath} (${buffer.length} bytes)`);
    }

    return buffer;
  } finally {
    win.destroy();
    await fs.unlink(tmpPath).catch(() => {});
  }
}

async function waitForCsrReady(win: BrowserWindow): Promise<void> {
  log('Polling for React render (#root children)...');
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < PAGE_READY_TIMEOUT_MS) {
    const childCount = await win.webContents.executeJavaScript(`
      (() => {
        const root = document.getElementById('root');
        return root ? root.children.length : -1;
      })();
    `);
    pollCount++;

    if (typeof childCount === 'number' && childCount > 0) {
      log(`React rendered after ${Date.now() - startTime}ms (${pollCount} polls)`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  log('WARNING: React render poll timed out, proceeding anyway');
}
