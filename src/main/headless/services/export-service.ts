import type { ExportFormat, PageSize } from '../../../shared/types';
import { DocumentExporter } from '../../exporter';
import { readDocumentConfig } from '../../workspace-data';
import { assertWorkspaceNameSafe } from '../../workspace-paths';

export interface DocumentExportParams {
  workspaceId: string;
  documentId: string;
  format: ExportFormat;
  outputPath: string;
}

/**
 * Exports a document. Reuses DocumentExporter which already builds + renders
 * each page via a hidden BrowserWindow and either writes a merged PDF or a
 * zip of images to `outputPath`.
 */
export async function handleDocumentExport(
  params: DocumentExportParams,
): Promise<{ files: string[] }> {
  assertWorkspaceNameSafe(params.workspaceId);
  const config = await readDocumentConfig(params.workspaceId, params.documentId);
  if (config.pages.length === 0) {
    throw new Error(`Document "${params.documentId}" has no pages to export`);
  }

  const size: PageSize = config.size;
  const exporter = new DocumentExporter();
  await exporter.exportDocument({
    format: params.format,
    workspaceName: params.workspaceId,
    docId: params.documentId,
    title: config.title,
    pages: config.pages.map((p) => p.id),
    size,
    dpi: 300,
    jpgQuality: 0.92,
    savePath: params.outputPath,
  });

  return { files: [params.outputPath] };
}
