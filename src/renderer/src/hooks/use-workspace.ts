import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { WorkspaceInfo } from '../../../shared/types';

export type { WorkspaceInfo };

export interface UseWorkspaceReturn {
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<void>;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await window.litho.workspace.list();
      setWorkspaces(list);
    } catch (err) {
      console.error('[use-workspace] Failed to list workspaces:', err);
      toast.error('Failed to load workspaces');
    }
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  return { workspaces, refreshWorkspaces };
}
