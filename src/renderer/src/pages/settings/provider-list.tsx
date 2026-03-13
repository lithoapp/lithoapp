import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProviderList } from '@/hooks/use-provider-list';
import { loadChatPrefs, saveChatPrefs } from '@/lib/chat-prefs';
import { ProviderCard } from './provider-card';

export function ProviderList(): React.JSX.Element {
  const {
    providers,
    authMethods,
    connectedProviders,
    availableProviders,
    loading,
    error,
    refetch,
  } = useProviderList();
  const [search, setSearch] = useState('');
  const [defaultProviderId, setDefaultProviderId] = useState('');
  const [defaultModelId, setDefaultModelId] = useState('');

  useEffect(() => {
    const prefs = loadChatPrefs();
    setDefaultProviderId(prefs.providerId);
    setDefaultModelId(prefs.modelId);
  }, []);

  const handleSetDefault = useCallback((providerId: string, modelId: string) => {
    saveChatPrefs({ providerId, modelId });
    setDefaultProviderId(providerId);
    setDefaultModelId(modelId);
  }, []);

  const handleClearDefault = useCallback(() => {
    saveChatPrefs({ providerId: '', modelId: '' });
    setDefaultProviderId('');
    setDefaultModelId('');
  }, []);

  const filteredAvailable = useMemo(() => {
    if (!search.trim()) return availableProviders;
    const q = search.toLowerCase();
    return availableProviders.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [availableProviders, search]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading providers...
      </div>
    );
  }

  if (error || providers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-8">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm text-destructive">{error || 'Failed to load providers'}</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Connected providers */}
      {connectedProviders.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Connected
          </p>
          <div className="flex flex-col gap-3">
            {connectedProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isConnected
                authMethods={authMethods[provider.id] ?? []}
                onRefresh={refetch}
                defaultProviderId={defaultProviderId}
                defaultModelId={defaultModelId}
                onSetDefault={handleSetDefault}
                onClearDefault={handleClearDefault}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available providers */}
      {availableProviders.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Available
          </p>

          {availableProviders.length > 3 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search providers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-10 text-sm"
              />
            </div>
          )}

          <div className="flex flex-col gap-3">
            {filteredAvailable.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                isConnected={false}
                authMethods={authMethods[provider.id] ?? []}
                onRefresh={refetch}
                defaultProviderId={defaultProviderId}
                defaultModelId={defaultModelId}
                onSetDefault={handleSetDefault}
                onClearDefault={handleClearDefault}
              />
            ))}
          </div>

          {filteredAvailable.length === 0 && search.trim() && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No providers matching &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
