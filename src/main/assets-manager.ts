import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, normalize, relative, resolve } from 'node:path';
import type { AssetEntry } from '../shared/types';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

interface ImageDimensions {
  width: number;
  height: number;
}

/** Replace spaces and other problematic characters with hyphens. */
function sanitizeFileName(name: string): string {
  const ext = extname(name).toLowerCase();
  const stem = name.slice(0, name.length - ext.length);
  return stem.replace(/\s+/g, '-') + ext;
}

function assetsRoot(workspacePath: string): string {
  return join(workspacePath, 'assets');
}

function isPositiveDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function toImageDimensions(width: number, height: number): ImageDimensions | undefined {
  if (!isPositiveDimension(width) || !isPositiveDimension(height)) {
    return undefined;
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

function readPngDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 24) return undefined;
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) return undefined;

  return toImageDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function readGifDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 10) return undefined;
  const header = buffer.subarray(0, 6).toString('ascii');
  if (header !== 'GIF87a' && header !== 'GIF89a') return undefined;

  return toImageDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;

  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) {
      offset += 1;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) return undefined;

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) return undefined;
    if (offset + 1 >= buffer.length) return undefined;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return undefined;

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      if (segmentLength < 7) return undefined;
      return toImageDimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }

    offset += segmentLength;
  }

  return undefined;
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 30) return undefined;
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return undefined;
  if (buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return undefined;

  const chunkType = buffer.subarray(12, 16).toString('ascii');

  if (chunkType === 'VP8X') {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return toImageDimensions(width, height);
  }

  if (chunkType === 'VP8L') {
    if (buffer[20] !== 0x2f || buffer.length < 25) return undefined;
    const byte1 = buffer[21];
    const byte2 = buffer[22];
    const byte3 = buffer[23];
    const byte4 = buffer[24];
    const width = 1 + (byte1 | ((byte2 & 0x3f) << 8));
    const height = 1 + (((byte2 & 0xc0) >> 6) | (byte3 << 2) | ((byte4 & 0x0f) << 10));
    return toImageDimensions(width, height);
  }

  if (chunkType === 'VP8 ') {
    if (buffer.length < 34) return undefined;
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return undefined;
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return toImageDimensions(width, height);
  }

  return undefined;
}

function readSvgDimensions(buffer: Buffer): ImageDimensions | undefined {
  const source = buffer.toString('utf8');
  const widthMatch = source.match(/\bwidth\s*=\s*['"]([0-9]+(?:\.[0-9]+)?)(px)?['"]/i);
  const heightMatch = source.match(/\bheight\s*=\s*['"]([0-9]+(?:\.[0-9]+)?)(px)?['"]/i);

  if (widthMatch && heightMatch) {
    return toImageDimensions(Number(widthMatch[1]), Number(heightMatch[1]));
  }

  const viewBoxMatch = source.match(
    /\bviewBox\s*=\s*['"](?:[0-9.+-]+[\s,]+){2}([0-9.+-]+)[\s,]+([0-9.+-]+)['"]/i,
  );

  if (!viewBoxMatch) return undefined;
  return toImageDimensions(Number(viewBoxMatch[1]), Number(viewBoxMatch[2]));
}

function readImageDimensions(absPath: string, ext: string): ImageDimensions | undefined {
  try {
    const buffer = readFileSync(absPath);

    if (ext === '.png') return readPngDimensions(buffer);
    if (ext === '.gif') return readGifDimensions(buffer);
    if (ext === '.jpg' || ext === '.jpeg') return readJpegDimensions(buffer);
    if (ext === '.webp') return readWebpDimensions(buffer);
    if (ext === '.svg') return readSvgDimensions(buffer);

    return undefined;
  } catch {
    return undefined;
  }
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
      ...(!isDir ? readImageDimensions(absEntry, ext) : undefined),
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
    const safeName = sanitizeFileName(basename(file.name));
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
