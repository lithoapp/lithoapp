import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ProviderInfo {
  id: string;
  name: string;
  api?: string;
  modelCount: number;
  autoConnect: boolean;
  defaultModel: string;
  internalProvider?: string;
}

export interface AuthMethod {
  type: 'api' | 'oauth' | 'free';
  label: string;
  id?: string;
}

export interface ProviderListState {
  providers: ProviderInfo[];
  connected: string[];
  authMethods: Record<string, AuthMethod[]>;
  connectedProviders: ProviderInfo[];
  availableProviders: ProviderInfo[];
  loading: boolean;
  error: string;
  refetch(): void;
}

export function useProviderList(): ProviderListState {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [authMethods, setAuthMethods] = useState<Record<string, AuthMethod[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const listResult = await window.litho.aiProvider.list();
      setProviders(listResult.providers);
      setConnected(listResult.connected);

      if (listResult.modelsDevError && listResult.providers.length === 0) {
        setError(listResult.modelsDevError);
        return;
      }

      // Fetch auth methods for each provider
      const methods: Record<string, AuthMethod[]> = {};
      await Promise.all(
        listResult.providers.map(async (p) => {
          try {
            methods[p.id] = await window.litho.aiProvider.authMethods(p.id);
          } catch {
            methods[p.id] = [];
          }
        }),
      );
      setAuthMethods(methods);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const connectedProviders = useMemo(
    () => providers.filter((p) => connected.includes(p.id)),
    [providers, connected],
  );

  const availableProviders = useMemo(
    () => providers.filter((p) => !connected.includes(p.id)),
    [providers, connected],
  );

  return {
    providers,
    connected,
    authMethods,
    connectedProviders,
    availableProviders,
    loading,
    error,
    refetch: fetchData,
  };
}
