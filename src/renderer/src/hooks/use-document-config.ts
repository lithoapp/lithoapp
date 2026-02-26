import { useCallback, useEffect, useState } from 'react';
import type { DocumentConfig, RendererError } from '../../../shared/types';

interface UseDocumentConfigReturn {
  config: DocumentConfig | null;
  loading: boolean;
  error: RendererError | null;
  refetch: () => void;
}

export function useDocumentConfig(workspace?: string, document?: string): UseDocumentConfigReturn {
  const [config, setConfig] = useState<DocumentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RendererError | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!workspace || !document) {
      setConfig(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.litho.renderer.readDocumentConfig(workspace, document);
      if (result.ok) {
        setConfig(result.data);
      } else {
        setConfig(null);
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  }, [workspace, document]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
}
