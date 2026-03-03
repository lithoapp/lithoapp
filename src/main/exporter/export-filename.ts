const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const WHITESPACE = /\s+/g;
const TRAILING_DOTS_OR_SPACES = /[.\s]+$/g;

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
}

function sanitizeSegment(value: string): string {
  const cleaned = stripControlChars(value)
    .replace(INVALID_FILENAME_CHARS, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
    .replace(TRAILING_DOTS_OR_SPACES, '');

  return cleaned || 'Untitled';
}

function truncate(value: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength).trimEnd().replace(TRAILING_DOTS_OR_SPACES, '');
}

export function buildExportBaseName(
  workspaceName: string,
  documentName: string,
  maxLength = 120,
): string {
  const workspacePart = sanitizeSegment(workspaceName);
  const documentPart = sanitizeSegment(documentName);
  return truncate(`${workspacePart} - ${documentPart}`, maxLength) || 'Untitled';
}

export function buildExportFileName(
  workspaceName: string,
  documentName: string,
  extension: string,
): string {
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  const safeExt = sanitizeSegment(ext).replace(WHITESPACE, '').toLowerCase() || 'bin';
  const maxBaseLength = Math.max(1, 255 - safeExt.length - 1);
  const baseName = buildExportBaseName(workspaceName, documentName, maxBaseLength);
  return `${baseName}.${safeExt}`;
}
