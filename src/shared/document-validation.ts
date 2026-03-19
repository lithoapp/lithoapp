import type { PageSize } from './types';

function stripPathSeparators(value: string): string {
  return value.replace(/[\\/]/g, '');
}

export function sanitizeFolderNameInput(value: string): string {
  return stripPathSeparators(value);
}

export function normalizeFolderName(value: string): string {
  return sanitizeFolderNameInput(value).trim().replace(/\s+/g, ' ');
}

export function getFolderNameError(value: string): string | null {
  const normalized = normalizeFolderName(value);
  if (!normalized) {
    return 'Folder name is required';
  }
  if (normalized === '.' || normalized === '..') {
    return 'Folder name must be more specific';
  }
  return null;
}

export function assertValidFolderName(value: string): string {
  const error = getFolderNameError(value);
  if (error) {
    throw new Error(error);
  }
  return normalizeFolderName(value);
}

export function getPageSizeError(size: PageSize): string | null {
  if (!Number.isFinite(size.width) || size.width <= 0) {
    return 'Width must be greater than 0';
  }
  if (!Number.isFinite(size.height) || size.height <= 0) {
    return 'Height must be greater than 0';
  }
  if (size.unit !== 'px' && size.unit !== 'mm') {
    return `Unsupported size unit: "${size.unit}"`;
  }
  return null;
}

export function assertValidPageSize(size: PageSize): PageSize {
  const error = getPageSizeError(size);
  if (error) {
    throw new Error(error);
  }
  return size;
}
