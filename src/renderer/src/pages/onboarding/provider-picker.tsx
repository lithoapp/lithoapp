import { AlertCircle, Check, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type ProviderInfo, useProviderList } from '@/hooks/use-provider-list';
import { cn } from '@/lib/utils';
import { ConnectDialog } from '../settings/connect-dialog';
import { AiProviderIcon } from '../settings/provider-icon';

function ProviderOption({
  provider,
  isConnected,
  onConnect,
}: {
  provider: ProviderInfo;
  isConnected: boolean;
  onConnect: () => void;
}): React.JSX.Element {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: interactive only when not connected
    <div
      role={isConnected ? undefined : 'button'}
      tabIndex={isConnected ? undefined : 0}
      onClick={isConnected ? undefined : onConnect}
      onKeyDown={
        isConnected
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') onConnect();
            }
      }
      className={cn(
        'flex items-center gap-3 rounded-xl border p-4 transition-colors',
        isConnected
          ? 'border-primary/40 bg-primary/5'
          : 'cursor-pointer border-border hover:border-primary/50',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
        <AiProviderIcon providerId={provider.id} size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-base font-medium">{provider.name}</span>
        <p className="text-sm text-muted-foreground">
          {provider.modelCount} model{provider.modelCount !== 1 ? 's' : ''}
        </p>
      </div>
      {isConnected ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
          <Check className="h-3 w-3" />
          Connected
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">Connect &rarr;</span>
      )}
    </div>
  );
}

export function ProviderPicker({
  onModelsChange,
}: {
  onModelsChange?: (count: number) => void;
}): React.JSX.Element {
  const { providers, connected, authMethods, loading, error, refetch } = useProviderList();
  const [dialogProvider, setDialogProvider] = useState<ProviderInfo | null>(null);

  const totalModels = useMemo(() => {
    return connected.reduce((sum, id) => {
      const p = providers.find((pr) => pr.id === id);
      return sum + (p ? p.modelCount : 0);
    }, 0);
  }, [providers, connected]);

  useEffect(() => {
    onModelsChange?.(totalModels);
  }, [totalModels, onModelsChange]);

  if (loading) {
    return (
      <div className="flex items-center gap-2.5 text-base text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading providers...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-base text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error || 'Failed to load providers'}
        </div>
        <Button variant="outline" onClick={refetch}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        {providers.map((provider) => (
          <ProviderOption
            key={provider.id}
            provider={provider}
            isConnected={connected.includes(provider.id)}
            onConnect={() => setDialogProvider(provider)}
          />
        ))}
      </div>

      {dialogProvider && (
        <ConnectDialog
          provider={dialogProvider}
          authMethods={authMethods[dialogProvider.id] ?? []}
          open
          onOpenChange={(open) => {
            if (!open) setDialogProvider(null);
          }}
          onConnected={refetch}
        />
      )}
    </div>
  );
}
