import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { DesignSystem } from '@/lib/design-system-types';

export interface UseDesignSystemReturn {
  designSystem: DesignSystem | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateTokens: (updates: Array<{ variable: string; value: string }>) => Promise<void>;
}

export function useDesignSystem(workspaceName: string | null): UseDesignSystemReturn {
  const [designSystem, setDesignSystem] = useState<DesignSystem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchDesignSystem = useCallback(async () => {
    if (!workspaceName) return;
    if (!hasFetched.current) setLoading(true);
    setError(null);
    try {
      const data = await window.litho.designSystem.read(workspaceName);
      setDesignSystem(data);
      hasFetched.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch design system');
    } finally {
      setLoading(false);
    }
  }, [workspaceName]);

  useEffect(() => {
    if (!workspaceName) {
      setDesignSystem(null);
      hasFetched.current = false;
      return;
    }
    setDesignSystem(null);
    setError(null);
    hasFetched.current = false;
    fetchDesignSystem();
  }, [workspaceName, fetchDesignSystem]);

  const updateTokens = useCallback(
    async (updates: Array<{ variable: string; value: string }>) => {
      if (!workspaceName) return;
      try {
        await window.litho.designSystem.updateTokens(workspaceName, updates);
        await fetchDesignSystem();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update tokens';
        toast.error(message);
      }
    },
    [workspaceName, fetchDesignSystem],
  );

  return { designSystem, loading, error, refetch: fetchDesignSystem, updateTokens };
}
