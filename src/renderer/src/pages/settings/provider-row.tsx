import { Check, Loader2, Plug, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuthMethod, ProviderInfo } from '@/hooks/use-provider-list';
import { connectFree } from '@/lib/provider-actions';
import { ConnectDialog } from './connect-dialog';
import { PingDialog } from './ping-dialog';

export function ProviderRow({
  provider,
  isConnected,
  authMethods,
  onRefresh,
}: {
  provider: ProviderInfo;
  isConnected: boolean;
  authMethods: AuthMethod[];
  onRefresh: () => void;
}): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pingOpen, setPingOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleAutoConnect = async (): Promise<void> => {
    setConnecting(true);
    try {
      await connectFree(provider.id);
      onRefresh();
    } catch (err) {
      console.error('[settings] Failed to auto-connect:', err);
      toast.error('Failed to connect provider');
    } finally {
      setConnecting(false);
    }
  };

  const modelCount = provider.modelCount;

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium">{provider.name}</span>
            <Badge variant={isConnected ? 'default' : 'outline'}>
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Connected
                </span>
              ) : (
                'Not connected'
              )}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {modelCount > 0 && (
              <span>
                {modelCount} model{modelCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div>
          {isConnected ? (
            <Button
              variant="outline"
              className="h-10 px-4 text-sm"
              onClick={() => setPingOpen(true)}
            >
              <Zap className="mr-1.5 h-4 w-4" />
              Ping
            </Button>
          ) : provider.autoConnect ? (
            <Button
              variant="outline"
              className="h-10 px-4 text-sm"
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
              variant="outline"
              className="h-10 px-4 text-sm"
              onClick={() => setDialogOpen(true)}
            >
              <Plug className="mr-1.5 h-4 w-4" />
              Connect
            </Button>
          )}
        </div>
      </div>

      <ConnectDialog
        provider={provider}
        authMethods={authMethods}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={onRefresh}
      />

      {isConnected && <PingDialog provider={provider} open={pingOpen} onOpenChange={setPingOpen} />}
    </>
  );
}
