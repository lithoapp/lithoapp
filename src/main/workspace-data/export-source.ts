import JSZip from 'jszip';
import { getWorkspaceDb } from './db';
import { readDocumentConfig, readPageSource, readStyles } from './db-backend';

interface PageExportMetadata {
  name: string;
  description: string;
}

interface DocumentExportMetadata {
  title: string;
  type: string;
}

export async function exportWorkspaceSource(workspace: string): Promise<Buffer> {
  const zip = new JSZip();
  const root = zip.folder(workspace);
  if (!root) throw new Error('Failed to create root folder');

  const styles = await readStyles(workspace);
  root.file('styles.css', styles);

  const db = getWorkspaceDb(workspace);
  const docs = db
    .prepare('SELECT id, title, type FROM documents ORDER BY created_at')
    .all() as Array<{ id: string; title: string; type: string }>;

  for (const doc of docs) {
    const docFolder = root.folder(doc.id);
    if (!docFolder) continue;

    const docMeta: DocumentExportMetadata = {
      title: doc.title,
      type: doc.type,
    };
    docFolder.file('document.json', JSON.stringify(docMeta, null, 2));

    const docConfig = await readDocumentConfig(workspace, doc.id);

    for (const page of docConfig.pages) {
      const source = await readPageSource(workspace, doc.id, page.id);

      const pageMeta: PageExportMetadata = {
        name: page.name,
        description: page.description ?? '',
      };

      docFolder.file(`${page.id}.tsx`, source);
      docFolder.file(`${page.id}.json`, JSON.stringify(pageMeta, null, 2));
    }
  }

  return zip.generateAsync({ type: 'nodebuffer' });
}
