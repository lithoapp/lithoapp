export function validateName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return 'Name is required';
  if (trimmed.length < 2) return 'Enter at least 2 characters';
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return 'Enter a valid name';
  return undefined;
}

export function validateOptionalEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) return 'Enter a valid email address';
  return undefined;
}
