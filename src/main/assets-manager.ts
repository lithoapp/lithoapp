import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, normalize, relative, resolve } from 'node:path';
import type { AssetEntry } from '../shared/types';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

function assetsRoot(workspacePath: string): string {
  return join(workspacePath, 'assets');
}

function resolveAssetPath(workspacePath: string, relPath: string): string {
  const root = assetsRoot(workspacePath);
  const abs = resolve(root, relPath);
  if (!normalize(abs).startsWith(`${normalize(root)}/`) && normalize(abs) !== normalize(root)) {
    throw new Error(`Path traversal rejected: "${relPath}" escapes assets root`);
  }
  return abs;
}

export function listAssets(
  workspacePath: string,
  dirPath: string,
  recursive = false,
): AssetEntry[] {
  const root = assetsRoot(workspacePath);
  const targetDir = dirPath ? resolveAssetPath(workspacePath, dirPath) : root;

  if (!existsSync(targetDir)) return [];

  const entries: AssetEntry[] = [];

  for (const name of readdirSync(targetDir)) {
    const absEntry = join(targetDir, name);
    const stat = statSync(absEntry);
    const isDir = stat.isDirectory();
    const ext = isDir ? '' : extname(name).toLowerCase();
    const entryRelPath = relative(root, absEntry);

    entries.push({
      name,
      path: entryRelPath,
      type: isDir ? 'directory' : 'file',
      size: isDir ? 0 : stat.size,
      ext,
    });

    if (recursive && isDir) {
      const children = listAssets(workspacePath, entryRelPath, true);
      entries.push(...children);
    }
  }

  return entries;
}

export function uploadAssets(
  workspacePath: string,
  dirPath: string,
  files: { name: string; data: Uint8Array }[],
): void {
  // Validate ALL extensions before writing any file (fail-fast)
  for (const file of files) {
    const ext = extname(basename(file.name)).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(
        `Unsupported file type: "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
      );
    }
  }

  const root = assetsRoot(workspacePath);
  const targetDir = dirPath ? resolveAssetPath(workspacePath, dirPath) : root;
  mkdirSync(targetDir, { recursive: true });

  for (const file of files) {
    const safeName = basename(file.name); // strip any path separators
    const dest = join(targetDir, safeName);
    writeFileSync(dest, file.data);
  }
}

/** Reserved folder for per-document assets. */
const DOCUMENTS_FOLDER = 'documents';

export function createAssetDirectory(workspacePath: string, dirPath: string): void {
  const topLevel = dirPath.split('/')[0];
  if (topLevel === DOCUMENTS_FOLDER) {
    throw new Error(`"${DOCUMENTS_FOLDER}" is a reserved folder name`);
  }
  const abs = resolveAssetPath(workspacePath, dirPath);
  if (existsSync(abs)) {
    throw new Error(`Directory already exists: "${dirPath}"`);
  }
  mkdirSync(abs, { recursive: true });
}

export function deleteAsset(workspacePath: string, entryPath: string): void {
  const abs = resolveAssetPath(workspacePath, entryPath);
  if (!existsSync(abs)) {
    throw new Error(`Asset not found: "${entryPath}"`);
  }
  rmSync(abs, { recursive: true, force: false });
}

// ── Document-scoped assets (flat structure at assets/documents/<docId>/*) ─

function docAssetsDir(docId: string): string {
  return join(DOCUMENTS_FOLDER, docId);
}

export function listDocumentAssets(workspacePath: string, docId: string): AssetEntry[] {
  return listAssets(workspacePath, docAssetsDir(docId), false).filter((e) => e.type === 'file');
}

export function uploadDocumentAssets(
  workspacePath: string,
  docId: string,
  files: { name: string; data: Uint8Array }[],
): void {
  uploadAssets(workspacePath, docAssetsDir(docId), files);
}

export function deleteDocumentAsset(workspacePath: string, docId: string, fileName: string): void {
  if (fileName.includes('/') || fileName.includes('\\')) {
    throw new Error(`Invalid file name: "${fileName}" — must not contain path separators`);
  }
  deleteAsset(workspacePath, join(docAssetsDir(docId), fileName));
}

export function renameDocumentAsset(
  workspacePath: string,
  docId: string,
  oldName: string,
  newName: string,
): void {
  for (const name of [oldName, newName]) {
    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid file name: "${name}" — must not contain path separators`);
    }
  }
  renameAsset(
    workspacePath,
    join(docAssetsDir(docId), oldName),
    join(docAssetsDir(docId), newName),
  );
}

export function renameAsset(workspacePath: string, oldPath: string, newPath: string): void {
  const absOld = resolveAssetPath(workspacePath, oldPath);
  const absNew = resolveAssetPath(workspacePath, newPath);

  if (!existsSync(absOld)) {
    throw new Error(`Asset not found: "${oldPath}"`);
  }
  if (existsSync(absNew)) {
    throw new Error(`Asset already exists at destination: "${newPath}"`);
  }

  renameSync(absOld, absNew);
}
