import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type {
  WorkspaceInfo,
  WorkspaceServerInfo,
  WorkspaceServerStatus,
} from '../../../shared/types';

export type { WorkspaceInfo, WorkspaceServerInfo, WorkspaceServerStatus };

export interface UseWorkspaceReturn {
  info: WorkspaceServerInfo;
  workspaces: WorkspaceInfo[];
  refreshWorkspaces: () => Promise<void>;
}

export function useWorkspace(): UseWorkspaceReturn {
  const [info, setInfo] = useState<WorkspaceServerInfo>({ status: 'stopped' });
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

    const unsubscribe = window.litho.workspace.onStatusChange((data) => {
      setInfo(data);
    });

    return unsubscribe;
  }, [refreshWorkspaces]);

  return { info, workspaces, refreshWorkspaces };
}
