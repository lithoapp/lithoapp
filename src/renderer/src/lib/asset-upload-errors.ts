function stripIpcPrefix(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, '').trim();
}

function extractQuotedNames(message: string): string[] {
  return [...message.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

export function getAssetUploadErrorMessage(err: unknown, locationLabel: string): string {
  const message = stripIpcPrefix(err instanceof Error ? err.message : String(err));

  if (message.startsWith('Asset already exists:')) {
    const [name] = extractQuotedNames(message);
    return name
      ? `An asset named "${name}" already exists in this ${locationLabel}.`
      : `An asset with that name already exists in this ${locationLabel}.`;
  }

  if (message.startsWith('Assets already exist:')) {
    const names = extractQuotedNames(message);
    return names.length > 0
      ? `These assets already exist in this ${locationLabel}: ${names.join(', ')}.`
      : `Some assets already exist in this ${locationLabel}.`;
  }

  if (message.startsWith('Duplicate upload name in selection:')) {
    const [name] = extractQuotedNames(message);
    return name
      ? `You selected "${name}" more than once.`
      : 'You selected the same file more than once.';
  }

  return message || 'Upload failed';
}
