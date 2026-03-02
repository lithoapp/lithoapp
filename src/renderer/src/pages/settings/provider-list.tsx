import { AlertCircle, Loader2, RefreshCw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProviderList } from '@/hooks/use-provider-list';
import { ProviderRow } from './provider-row';

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

  const filteredAvailable = useMemo(() => {
    if (!search.trim()) return availableProviders;
    const q = search.toLowerCase();
    return availableProviders.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [availableProviders, search]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <p className="text-sm font-medium">Providers</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading providers...
        </div>
      </div>
    );
  }

  if (error || providers.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <p className="text-sm font-medium">Providers</p>
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error || 'Failed to load providers'}
        </div>
        <Button variant="outline" className="h-10 w-fit px-4 text-sm" onClick={refetch}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {connectedProviders.length > 0 && (
        <div className="flex flex-col rounded-lg border">
          <div className="px-5 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Connected
            </p>
          </div>
          {connectedProviders.map((provider, i) => (
            <div key={provider.id} className={i > 0 ? 'border-t' : ''}>
              <ProviderRow
                provider={provider}
                isConnected
                authMethods={authMethods[provider.id] ?? []}
                onRefresh={refetch}
              />
            </div>
          ))}
        </div>
      )}

      {availableProviders.length > 0 && (
        <div className="flex flex-col rounded-lg border">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Available
            </p>
          </div>
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search providers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 pl-10 text-sm"
              />
            </div>
          </div>
          {filteredAvailable.map((provider, i) => (
            <div key={provider.id} className={i > 0 ? 'border-t' : ''}>
              <ProviderRow
                provider={provider}
                isConnected={false}
                authMethods={authMethods[provider.id] ?? []}
                onRefresh={refetch}
              />
            </div>
          ))}
          {filteredAvailable.length === 0 && search.trim() && (
            <p className="px-5 py-4 text-center text-sm text-muted-foreground">
              No providers matching &ldquo;{search}&rdquo;
            </p>
          )}
        </div>
      )}

      {providers.length === 0 && (
        <p className="text-sm text-muted-foreground">No providers available.</p>
      )}
    </div>
  );
}
