export function sanitizeAssetNameInput(value: string): string {
  return value.replace(/[\\/]/g, '');
}

export function getAssetNameError(value: string): string | null {
  const name = sanitizeAssetNameInput(value).trim();
  if (!name) {
    return 'Name is required';
  }
  if (name === '.' || name === '..') {
    return 'Name must be more specific';
  }
  return null;
}

export function assertValidAssetName(value: string): string {
  const error = getAssetNameError(value);
  if (error) {
    throw new Error(error);
  }
  return sanitizeAssetNameInput(value).trim();
}
