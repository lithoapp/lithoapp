import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExportFormat } from '../../shared/types';
import { listDocumentsFull } from '../workspace-data';
import { DocumentExporter } from './document-exporter';

const JPG_QUALITY = 90;
const MM_DPI_VARIANTS = [72, 150, 300] as const;

interface ExportJob {
  format: ExportFormat;
  dpi: number;
  subdir: string;
  pages: string[];
  savePath: string;
}

interface BatchDoc {
  slug: string;
  title: string;
  size: { width: number; height: number; unit: string };
  pages: string[];
}

function log(message: string): void {
  console.log(`[batch-export] ${message}`);
}

function parseArgs(): { workspaceName: string; outputPath: string } {
  const args = process.argv;
  const wsIdx = args.indexOf('--workspace');
  const outIdx = args.indexOf('--output');

  if (wsIdx === -1 || wsIdx + 1 >= args.length) {
    throw new Error('Usage: --batch-export --workspace <name> --output <path>');
  }
  if (outIdx === -1 || outIdx + 1 >= args.length) {
    throw new Error('Usage: --batch-export --workspace <name> --output <path>');
  }

  return {
    workspaceName: args[wsIdx + 1],
    outputPath: args[outIdx + 1],
  };
}

function buildJobs(doc: BatchDoc, outputPath: string): ExportJob[] {
  const docDir = join(outputPath, doc.slug);
  const isMm = doc.size.unit === 'mm';
  const jobs: ExportJob[] = [];

  // PDF: one merged file per document, no DPI variants
  jobs.push({
    format: 'pdf',
    dpi: 72,
    subdir: 'pdf',
    pages: doc.pages,
    savePath: join(docDir, 'pdf', `${doc.slug}.pdf`),
  });

  // Image formats
  const imageFormats: ExportFormat[] = ['png', 'jpg'];

  for (const format of imageFormats) {
    if (isMm) {
      // mm-based: 3 DPI variants, one file per page
      for (const dpi of MM_DPI_VARIANTS) {
        const subdir = `${format}-${dpi}dpi`;
        for (const pageId of doc.pages) {
          jobs.push({
            format,
            dpi,
            subdir,
            pages: [pageId],
            savePath: join(docDir, subdir, `${pageId}.${format}`),
          });
        }
      }
    } else {
      // px-based: single variant (native pixels), no DPI suffix
      const subdir = format;
      for (const pageId of doc.pages) {
        jobs.push({
          format,
          dpi: 72,
          subdir,
          pages: [pageId],
          savePath: join(docDir, subdir, `${pageId}.${format}`),
        });
      }
    }
  }

  return jobs;
}

export async function runBatchExport(): Promise<void> {
  const { workspaceName, outputPath } = parseArgs();
  log(`Workspace: ${workspaceName}`);
  log(`Output:    ${outputPath}`);

  const documents = await listDocumentsFull(workspaceName);
  log(`Found ${documents.length} documents`);

  const exporter = new DocumentExporter();
  let completedJobs = 0;

  const docJobs = documents.map((doc) => ({
    doc,
    jobs: buildJobs(doc, outputPath),
  }));
  const totalJobs = docJobs.reduce((sum, dj) => sum + dj.jobs.length, 0);
  log(`Total export jobs: ${totalJobs}`);

  for (const { doc, jobs } of docJobs) {
    log(
      `\n--- ${doc.title} (${doc.slug}) | ` +
        `${doc.size.width}x${doc.size.height}${doc.size.unit} | ` +
        `${doc.pages.length} page(s) ---`,
    );

    for (const job of jobs) {
      await mkdir(join(outputPath, doc.slug, job.subdir), { recursive: true });

      log(`[${completedJobs + 1}/${totalJobs}] ${job.format} ${job.subdir}`);

      await exporter.exportDocument({
        format: job.format,
        workspaceName,
        slug: doc.slug,
        title: doc.title,
        pages: job.pages,
        size: doc.size,
        dpi: job.dpi,
        jpgQuality: JPG_QUALITY,
        savePath: job.savePath,
      });

      completedJobs++;
    }
  }

  log(`\nBatch export complete: ${completedJobs} jobs`);
}
