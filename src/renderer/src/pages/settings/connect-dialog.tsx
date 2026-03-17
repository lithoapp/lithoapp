import { AlertCircle, ExternalLink, Eye, EyeOff, Key, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useConnectFlow } from '@/hooks/use-connect-flow';
import type { AuthMethod, ProviderInfo } from '@/hooks/use-provider-list';

export function ConnectDialog({
  provider,
  authMethods,
  open,
  onOpenChange,
  onConnected,
}: {
  provider: ProviderInfo;
  authMethods: AuthMethod[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}): React.JSX.Element {
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);

  const handleConnected = useCallback(() => {
    onConnected();
    onOpenChange(false);
  }, [onConnected, onOpenChange]);

  const flow = useConnectFlow(provider, authMethods, handleConnected);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        flow.reset();
        setIsApiKeyVisible(false);
      }
      onOpenChange(isOpen);
    },
    [flow, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {provider.name}</DialogTitle>
        </DialogHeader>

        {flow.error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {flow.error}
          </div>
        )}

        {flow.step === 'select' && (
          <div className="flex flex-col gap-2">
            {authMethods.map((method, i) => (
              <button
                key={method.label}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                  flow.selectedMethod === i
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => flow.selectMethod(i)}
              >
                {method.type === 'oauth' ? (
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Key className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-medium">{method.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {method.type === 'oauth'
                      ? 'Opens browser to authenticate'
                      : 'Enter key manually'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {flow.step === 'api-key' && (
          <div className="relative">
            <Input
              className="h-11 pr-12 text-base"
              type={isApiKeyVisible ? 'text' : 'password'}
              placeholder="Enter your API key"
              value={flow.apiKey}
              onChange={(e) => flow.setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void flow.submitApiKey();
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1 h-9 w-9 text-muted-foreground"
              onClick={() => setIsApiKeyVisible((current) => !current)}
              aria-label={isApiKeyVisible ? 'Hide API key' : 'Show API key'}
              title={isApiKeyVisible ? 'Hide API key' : 'Show API key'}
            >
              {isApiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {flow.step === 'oauth-waiting' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for authentication to complete...
            </div>
            {flow.instructions && (
              <p className="text-sm text-muted-foreground">{flow.instructions}</p>
            )}
          </div>
        )}

        {flow.step === 'oauth-code' && (
          <div className="flex flex-col gap-3">
            {flow.instructions && (
              <p className="text-sm text-muted-foreground">{flow.instructions}</p>
            )}
            <Input
              className="h-11 text-base"
              placeholder="Paste authorization code"
              value={flow.oauthCode}
              onChange={(e) => flow.setOauthCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void flow.submitOAuthCode();
              }}
            />
          </div>
        )}

        <DialogFooter>
          {flow.step === 'select' && (
            <Button className="h-11" onClick={flow.continue} disabled={flow.loading}>
              Continue
            </Button>
          )}
          {flow.step === 'api-key' && (
            <Button
              className="h-11"
              onClick={() => void flow.submitApiKey()}
              disabled={flow.loading || !flow.apiKey.trim()}
            >
              {flow.loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          )}
          {flow.step === 'oauth-code' && (
            <Button
              className="h-11"
              onClick={() => void flow.submitOAuthCode()}
              disabled={flow.loading || !flow.oauthCode.trim()}
            >
              {flow.loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Submit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
