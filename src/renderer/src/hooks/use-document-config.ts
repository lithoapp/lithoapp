import { useCallback, useEffect, useState } from 'react';
import type { DocumentConfig } from '../../../shared/types';

interface UseDocumentConfigReturn {
  config: DocumentConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useDocumentConfig(workspace?: string, document?: string): UseDocumentConfigReturn {
  const [config, setConfig] = useState<DocumentConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!workspace || !document) {
      setConfig(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const docs = await window.litho.document.list(workspace);
      const doc = docs.find((d) => d.id === document);
      if (doc) {
        setConfig({ title: doc.title, size: doc.size, pages: doc.pages });
      } else {
        setConfig(null);
        setError(`Document "${document}" not found`);
      }
    } catch (err) {
      setConfig(null);
      setError(err instanceof Error ? err.message : 'Failed to load document config');
    } finally {
      setLoading(false);
    }
  }, [workspace, document]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  return { config, loading, error, refetch: fetchConfig };
}
