import { useCallback, useState } from 'react';
import type { PageExportOptions, RendererError } from '../../../shared/types';

interface UsePageExportReturn {
  loading: boolean;
  error: RendererError | null;
  exportPage: (options: PageExportOptions) => Promise<boolean>;
}

export function usePageExport(): UsePageExportReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RendererError | null>(null);

  const exportPage = useCallback(async (options: PageExportOptions): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.litho.renderer.export(options);
      if (result.ok) {
        return true;
      }
      setError(result.error);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, exportPage };
}
