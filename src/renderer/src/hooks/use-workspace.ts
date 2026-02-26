import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { WorkspaceInfo, WorkspaceState } from '../../../shared/types';

export type { WorkspaceInfo, WorkspaceState };

export interface UseWorkspaceReturn {
  info: WorkspaceState;
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<void>;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [info, setInfo] = useState<WorkspaceState>({
    status: 'inactive',
    workspaceName: null,
    workspacePath: null,
  });
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
    window.litho.workspace
      .getActive()
      .then(setInfo)
      .catch((err) => {
        console.error('[use-workspace] Failed to get active workspace:', err);
        toast.error('Failed to get workspace status');
      });
    refreshWorkspaces();

    const unsubscribe = window.litho.workspace.onChanged((data) => {
      setInfo(data);
    });

    return unsubscribe;
  }, [refreshWorkspaces]);

  return { info, workspaces, refreshWorkspaces };
}
