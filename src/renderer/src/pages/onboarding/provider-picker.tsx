import { AlertCircle, Check, Loader2, Plug, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { type ProviderInfo, useProviderList } from '@/hooks/use-provider-list';
import { connectFree } from '@/lib/provider-actions';
import { cn } from '@/lib/utils';
import { ConnectDialog } from '../settings/connect-dialog';
import { AiProviderIcon } from '../settings/provider-icon';

const ZEN_ID = 'free';
const FEATURED_IDS = ['anthropic', 'openai', 'google', 'github-copilot'];

function ZenCard({
  provider,
  isConnected,
}: {
  provider: ProviderInfo;
  isConnected: boolean;
}): React.JSX.Element {
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async (): Promise<void> => {
    setConnecting(true);
    try {
      await connectFree(provider.id);
    } catch {
      toast.error('Failed to connect');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <AiProviderIcon providerId={provider.id} size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{provider.name}</span>
            <span className="text-xs text-muted-foreground/60">Provided by opencode.ai</span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {provider.modelCount} model{provider.modelCount !== 1 ? 's' : ''} ready to use — no
            setup needed
          </p>
        </div>
        {isConnected ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
            <Check className="h-3 w-3" />
            Ready
          </span>
        ) : (
          <Button
            variant="default"
            className="h-9 shrink-0 px-4 text-sm"
            onClick={() => void handleConnect()}
            disabled={connecting}
          >
            {connecting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plug className="mr-1.5 h-4 w-4" />
            )}
            Connect
          </Button>
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
