import { useCallback, useState } from 'react';
import type { PageBuildData, RenderApproach, RendererError } from '../../../shared/types';

interface UsePageBuildReturn {
  data: PageBuildData | null;
  loading: boolean;
  error: RendererError | null;
  build: (
    workspace: string,
    document: string,
    page: string,
    approach?: RenderApproach,
  ) => Promise<void>;
  reset: () => void;
}

export function usePageBuild(): UsePageBuildReturn {
  const [data, setData] = useState<PageBuildData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RendererError | null>(null);

  const build = useCallback(
    async (workspace: string, document: string, page: string, approach?: RenderApproach) => {
      setLoading(true);
      setData(null);
      setError(null);
      try {
        const result = await window.litho.renderer.build(workspace, document, page, approach);
        if (result.ok) {
          setData(result.data);
        } else {
          setError(result.error);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, build, reset };
}
