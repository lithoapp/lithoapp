import { AlertCircle, Check, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ProviderInfo, useProviderList } from '@/hooks/use-provider-list';
import { cn } from '@/lib/utils';
import { ConnectDialog } from '../settings/connect-dialog';

const ZEN_ID = 'free';
const FEATURED_IDS = ['anthropic', 'openai', 'google', 'github-copilot'];

function ZenCard({
  provider,
  isConnected,
}: {
  provider: ProviderInfo;
  isConnected: boolean;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            <span className="text-lg font-semibold">{provider.name}</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {provider.modelCount} model{provider.modelCount !== 1 ? 's' : ''} ready to use — no
            setup needed
          </p>
        </div>
        {isConnected && (
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
            <Check className="h-3.5 w-3.5" />
            Ready
          </span>
        )}
      </div>
    </div>
  );
}

function FeaturedCard({
  provider,
  isConnected,
  onConnect,
}: {
  provider: ProviderInfo;
  isConnected: boolean;
  onConnect: () => void;
}): React.JSX.Element {
  const modelCount = provider.modelCount;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: interactive only when not connected (role is set conditionally)
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
        'flex flex-col gap-1.5 rounded-lg border p-4 transition-colors',
        isConnected
          ? 'border-primary/40 bg-primary/5'
          : 'cursor-pointer border-border hover:border-primary/50',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-medium leading-tight">{provider.name}</span>
        {isConnected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
      </div>
      <p className="text-sm text-muted-foreground">
        {modelCount} model{modelCount !== 1 ? 's' : ''}
      </p>
      {isConnected ? (
        <p className="text-sm font-medium text-primary">Connected</p>
      ) : (
        <p className="text-sm text-muted-foreground">Connect →</p>
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

  const zenProvider = useMemo(() => providers.find((p) => p.id === ZEN_ID) ?? null, [providers]);

  const featuredProviders = useMemo(
    () => FEATURED_IDS.flatMap((id) => providers.find((p) => p.id === id) ?? []),
    [providers],
  );

  const hasOtherProviders = useMemo(
    () => providers.some((p) => p.id !== ZEN_ID && !FEATURED_IDS.includes(p.id)),
    [providers],
  );

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

  const isConnected = (id: string): boolean => connected.includes(id);

  return (
    <div className="flex flex-col gap-6">
      {zenProvider && (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Included with Litho
          </p>
          <ZenCard provider={zenProvider} isConnected={isConnected(ZEN_ID)} />
        </div>
      )}

      {featuredProviders.length > 0 && (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Popular providers
          </p>
          <div className="grid grid-cols-2 gap-3">
            {featuredProviders.map((provider) => (
              <FeaturedCard
                key={provider.id}
                provider={provider}
                isConnected={isConnected(provider.id)}
                onConnect={() => setDialogProvider(provider)}
              />
            ))}
          </div>
        </div>
      )}

      {hasOtherProviders && (
        <p className="text-base text-muted-foreground">More providers available in Settings.</p>
      )}

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
