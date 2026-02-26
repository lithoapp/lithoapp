import { useCallback, useState } from 'react';

export interface WorkspaceError {
  type: string;
  message: string;
  file?: string;
  route?: string;
  method?: string;
  url?: string;
  stack?: string;
}

export type WorkspaceErrorSeverity = 'error' | 'warning';

export function severityOf(type: string): WorkspaceErrorSeverity {
  if (type === 'compilation' || type === 'css') return 'error';
  if (type === 'asset-404') return 'warning';
  return 'error';
}

export interface UseWorkspaceErrorsReturn {
  errors: WorkspaceError[];
  errorCount: number;
  warningCount: number;
  hasIssues: boolean;
  clear: () => void;
}

/**
 * Workspace errors were previously emitted by the workspace server.
 * Now that the server has been removed, this hook provides a stable
 * no-op interface so the chat UI can still render without changes.
 */
export function useWorkspaceErrors(): UseWorkspaceErrorsReturn {
  const [errors] = useState<WorkspaceError[]>([]);
  const clear = useCallback(() => {}, []);

  return {
    errors,
    errorCount: 0,
    warningCount: 0,
    hasIssues: false,
    clear,
  };
}
