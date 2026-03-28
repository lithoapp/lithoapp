const IPC_PREFIX_RE = /^Error invoking remote method\s+['"][^'"]+['"]:\s*/i;

export function extractIpcErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message.replace(IPC_PREFIX_RE, '') || fallback;
  if (typeof err === 'string') return err.replace(IPC_PREFIX_RE, '') || fallback;
  return fallback;
}
