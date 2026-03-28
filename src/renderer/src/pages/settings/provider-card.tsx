import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  LogOut,
  MoreHorizontal,
  Plug,
  Star,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AuthMethod, ProviderInfo } from '@/hooks/use-provider-list';
import { maybeAutoSelectDefault } from '@/lib/chat-prefs';
import { extractIpcErrorMessage } from '@/lib/ipc-error';
import { connectFree, disconnectProvider } from '@/lib/provider-actions';
import { cn } from '@/lib/utils';
import { ConnectDialog } from './connect-dialog';
import { PingDialog } from './ping-dialog';
import { AiProviderIcon } from './provider-icon';

interface ModelEntry {
  id: string;
  name: string;
}

export function ProviderCard({
  provider,
  isConnected,
  authMethods,
  onRefresh,
  defaultProviderId,
  defaultModelId,
  onSetDefault,
  onClearDefault,
}: {
  provider: ProviderInfo;
  isConnected: boolean;
  authMethods: AuthMethod[];
  onRefresh: () => void;
  defaultProviderId: string;
  defaultModelId: string;
  onSetDefault: (providerId: string, modelId: string) => void;
  onClearDefault: () => void;
}): React.JSX.Element {
  const [connectOpen, setConnectOpen] = useState(false);
  const [pingOpen, setPingOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Fetch models when card is expanded
  useEffect(() => {
    if (!expanded || !isConnected) return;
    setModelsLoading(true);
    window.litho.aiProvider
      .models(provider.id)
      .then((list) => setModels(list.map((m) => ({ id: m.id, name: m.name }))))
      .catch(() => setModels([]))
      .finally(() => setModelsLoading(false));
  }, [expanded, isConnected, provider.id]);

  const isDefaultProvider = defaultProviderId === provider.id;

  const handleAutoConnect = async (): Promise<void> => {
    setConnecting(true);
    try {
      await connectFree(provider.id);
      const autoModel = await maybeAutoSelectDefault(provider.id);
      if (autoModel) toast.success(`Default model set to ${autoModel}`);
      onRefresh();
    } catch (err) {
      toast.error(extractIpcErrorMessage(err, 'Failed to connect provider'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      await disconnectProvider(provider.id);
      if (defaultProviderId === provider.id) {
        onClearDefault();
      }
      onRefresh();
    } catch (err) {
      toast.error(extractIpcErrorMessage(err, 'Failed to disconnect provider'));
    } finally {
      setDisconnecting(false);
    }
  }, [provider.id, defaultProviderId, onClearDefault, onRefresh]);

  const handleSetDefault = useCallback(
    (modelId: string) => {
      onSetDefault(provider.id, modelId);
      toast.success(
        `Default model set to ${models.find((m) => m.id === modelId)?.name ?? modelId}`,
      );
    },
    [provider.id, models, onSetDefault],
  );

  const currentDefaultModel = useMemo(() => {
    if (!isDefaultProvider) return null;
    return models.find((m) => m.id === defaultModelId) ?? null;
  }, [isDefaultProvider, models, defaultModelId]);

  return (
    <>
      <div
        className={cn(
          'group rounded-xl border transition-all',
          isConnected ? 'border-border bg-card' : 'border-dashed border-border/60 bg-card/50',
          expanded && 'ring-1 ring-primary/20',
        )}
      >
        {/* Card header */}
        <div className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/50">
            <AiProviderIcon providerId={provider.id} size={28} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">{provider.name}</span>
              {provider.autoConnect && (
                <span className="text-xs text-muted-foreground/60">Provided by opencode.ai</span>
              )}
              {isConnected && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                  <Check className="h-3 w-3" />
                  Connected
                </span>
              )}
              {isDefaultProvider && isConnected && (
                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <Star className="h-3 w-3" />
                  Default
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {provider.modelCount > 0 ? (
                <>
                  {provider.modelCount} model{provider.modelCount !== 1 ? 's' : ''} available
                  {isConnected && currentDefaultModel && (
                    <span className="text-foreground/70">
                      {' '}
                      &middot; Using {currentDefaultModel.name}
                    </span>
                  )}
                </>
              ) : (
                'No models loaded'
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setExpanded(!expanded)}
                  title={expanded ? 'Collapse' : 'Show models'}
                >
                  {expanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setPingOpen(true)}>
                      <Zap className="mr-2 h-4 w-4" />
                      Test connection
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => void handleDisconnect()}
                      disabled={disconnecting}
                    >
                      {disconnecting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <LogOut className="mr-2 h-4 w-4" />
                      )}
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : provider.autoConnect ? (
              <Button
                variant="default"
                className="h-9 px-4 text-sm"
                onClick={() => void handleAutoConnect()}
                disabled={connecting}
              >
                {connecting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="mr-1.5 h-4 w-4" />
                )}
                Connect
              </Button>
            ) : (
              <Button
                variant="default"
                className="h-9 px-4 text-sm"
                onClick={() => setConnectOpen(true)}
              >
                <Plug className="mr-1.5 h-4 w-4" />
                Connect
              </Button>
            )}
          </div>
        </div>

        {/* Expanded model list */}
        {expanded && isConnected && (
          <div className="border-t">
            {modelsLoading ? (
              <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading models...
              </div>
            ) : models.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No models available</p>
            ) : (
              <div className="max-h-64 overflow-y-auto p-2">
                {models.map((model) => {
                  const isDefault = isDefaultProvider && defaultModelId === model.id;
                  return (
                    <div
                      key={model.id}
                      className={cn(
                        'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                        isDefault ? 'bg-primary/5' : 'hover:bg-muted/50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <span className={cn('truncate', isDefault && 'font-medium')}>
                          {model.name}
                        </span>
                      </div>
                      <Button
                        variant={isDefault ? 'default' : 'ghost'}
                        size="sm"
                        className={cn('h-7 text-xs', isDefault && 'pointer-events-none')}
                        onClick={() => handleSetDefault(model.id)}
                      >
                        <Star className={cn('mr-1 h-3 w-3', isDefault && 'fill-current')} />
                        {isDefault ? 'Default' : 'Set default'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <ConnectDialog
        provider={provider}
        authMethods={authMethods}
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={async () => {
          const autoModel = await maybeAutoSelectDefault(provider.id);
          if (autoModel) toast.success(`Default model set to ${autoModel}`);
          onRefresh();
        }}
      />

      {isConnected && <PingDialog provider={provider} open={pingOpen} onOpenChange={setPingOpen} />}
    </>
  );
}
