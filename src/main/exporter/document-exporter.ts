import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import type { ExportFormat, ExportProgress, ExportRequest } from '../../shared/types';
import { buildPage } from '../renderer';
import { captureException } from '../sentry';

function log(message: string, ...args: unknown[]): void {
  console.log(`[export] ${message}`, ...args);
}

export class DocumentExporter extends EventEmitter {
  private progress: ExportProgress = { status: 'idle', current: 0, total: 0 };

  getProgress(): ExportProgress {
    return { ...this.progress };
  }

  async exportDocument(request: ExportRequest): Promise<void> {
    if (this.progress.status === 'exporting') {
      throw new Error('An export is already in progress');
    }

    const { format, workspaceName, docId, pages, size, dpi, jpgQuality, savePath } = request;

    log('Starting export', { format, docId, pageCount: pages.length, size, dpi, savePath });
    this.setProgress({ status: 'exporting', current: 0, total: pages.length });

    try {
      const buffers: Buffer[] = [];

      for (let i = 0; i < pages.length; i++) {
        this.setProgress({ status: 'exporting', current: i, total: pages.length });
        log(`Building page ${i + 1}/${pages.length}: ${pages[i]}`);

        // Build HTML via the offline build pipeline
        const buildResult = await buildPage(workspaceName, docId, pages[i]);
        if (!buildResult.ok) {
          throw new Error(`Build failed for page ${pages[i]}: ${buildResult.error.message}`);
        }

        log(`Page ${i + 1} built, exporting as ${format}...`);

        // Export via hidden BrowserWindow (lazy import to avoid circular dep)
        const { exportPage } = await import('./export-page');
        const buffer = await exportPage({
          html: buildResult.data.html,
          approach: buildResult.data.approach,
          format,
          size,
          dpi,
          jpgQuality,
          savePath: '', // Empty = buffer-only, no disk write
        });

        log(`Page ${i + 1} captured, ${buffer.length} bytes`);
        buffers.push(buffer);
      }

      log('Assembling output...');
      await this.assembleOutput(buffers, format, savePath);
      log('Export complete');
      this.setProgress({ status: 'done', current: pages.length, total: pages.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      log('Export failed:', message);
      captureException(err, {
        tags: { component: 'document-exporter' },
        extras: { docId, format, pageCount: pages.length },
      });
      this.setProgress({ status: 'error', current: 0, total: pages.length, error: message });
      throw err;
    }
  }

  private async assembleOutput(
    buffers: Buffer[],
    format: ExportFormat,
    savePath: string,
  ): Promise<void> {
    if (format === 'pdf') {
      await this.mergePdfs(buffers, savePath);
    } else if (buffers.length === 1) {
      await fs.writeFile(savePath, buffers[0]);
    } else {
      await this.bundleZip(buffers, format, savePath);
    }
  }

  private async mergePdfs(buffers: Buffer[], savePath: string): Promise<void> {
    const mergedPdf = await PDFDocument.create();
    for (const buffer of buffers) {
      const donor = await PDFDocument.load(buffer);
      const pages = await mergedPdf.copyPages(donor, donor.getPageIndices());
      for (const page of pages) {
        mergedPdf.addPage(page);
      }
    }
    await fs.writeFile(savePath, await mergedPdf.save());
  }

  private async bundleZip(
    buffers: Buffer[],
    format: ExportFormat,
    savePath: string,
  ): Promise<void> {
    const zip = new JSZip();
    const ext = format === 'jpg' ? 'jpg' : 'png';
    for (let i = 0; i < buffers.length; i++) {
      zip.file(`page-${i + 1}.${ext}`, buffers[i]);
    }
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.writeFile(savePath, zipBuffer);
  }

  private setProgress(progress: ExportProgress): void {
    this.progress = progress;
    this.emit('progress', { ...progress });
  }
}
