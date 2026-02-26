import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceError, WorkspaceErrorType } from '../../../shared/types';

export type { WorkspaceError };

export type WorkspaceErrorSeverity = 'error' | 'warning';

const ERROR_TYPES: Set<WorkspaceErrorType> = new Set(['compilation', 'css']);
const WARNING_TYPES: Set<WorkspaceErrorType> = new Set(['asset-404']);

export function severityOf(type: WorkspaceErrorType): WorkspaceErrorSeverity {
  if (ERROR_TYPES.has(type)) return 'error';
  if (WARNING_TYPES.has(type)) return 'warning';
  return 'error';
}

/** Dedupe key: type + message to avoid flooding the pill with repeats. */
function errorKey(err: WorkspaceError): string {
  return `${err.type}::${err.message}`;
}

export interface UseWorkspaceErrorsReturn {
  errors: WorkspaceError[];
  errorCount: number;
  warningCount: number;
  hasIssues: boolean;
  /** Clear the collected errors (e.g. after sending to agent or navigating). */
  clear: () => void;
}

export function useWorkspaceErrors(): UseWorkspaceErrorsReturn {
  const [errors, setErrors] = useState<WorkspaceError[]>([]);

  useEffect(() => {
    const unsubscribe = window.litho.workspace.onError((data) => {
      const err = data as WorkspaceError;
      setErrors((prev) => {
        const key = errorKey(err);
        if (prev.some((e) => errorKey(e) === key)) return prev;
        return [...prev, err];
      });
    });
    return unsubscribe;
  }, []);

  const clear = useCallback(() => setErrors([]), []);

  const errorCount = errors.filter((e) => severityOf(e.type) === 'error').length;
  const warningCount = errors.filter((e) => severityOf(e.type) === 'warning').length;

  return {
    errors,
    errorCount,
    warningCount,
    hasIssues: errors.length > 0,
    clear,
  };
}
