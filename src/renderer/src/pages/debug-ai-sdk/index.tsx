import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  Key,
  Loader2,
  LogOut,
  RefreshCw,
  Search,
  Unplug,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Types (mirror preload types)
// ---------------------------------------------------------------------------

interface ProviderInfo {
  id: string;
  name: string;
  env: string[];
  npm?: string;
  api?: string;
  modelCount: number;
}

interface ModelInfo {
  id: string;
  name: string;
  family?: string;
  contextWindow?: number;
  maxOutput?: number;
  inputCost?: number;
  outputCost?: number;
  capabilities: string[];
}

interface AuthMethod {
  type: 'api' | 'oauth' | 'free';
  label: string;
  id?: string;
}

interface PingResult {
  text: string;
  reasoning: string;
  finishReason: string;
  modelId: string;
  latencyMs: number;
  error?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function DebugAiSdkPage(): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [modelsDevLoaded, setModelsDevLoaded] = useState(false);
  const [modelsDevError, setModelsDevError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Connect dialog state
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [connectProviderId, setConnectProviderId] = useState<string | null>(null);
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Anthropic code-paste OAuth state
  const [oauthMethod, setOauthMethod] = useState<'auto' | 'code' | null>(null);
  const [oauthVerifier, setOauthVerifier] = useState<string | null>(null);
  const [oauthMode, setOauthMode] = useState<string | null>(null);
  const [oauthCodeInput, setOauthCodeInput] = useState('');

  // Model browser state
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerModels, setProviderModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Ping state
  const [pingDialogOpen, setPingDialogOpen] = useState(false);
  const [pingProviderId, setPingProviderId] = useState<string | null>(null);
  const [pingModelId, setPingModelId] = useState<string>('');
  const [pingModels, setPingModels] = useState<ModelInfo[]>([]);
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.litho.aiProvider.list();
      setProviders(data.providers);
      setConnected(data.connected);
      setModelsDevLoaded(data.modelsDevLoaded);
      setModelsDevError(data.modelsDevError);
    } catch (err) {
      toast.error('Failed to load providers', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const connectedProviders = useMemo(
    () => providers.filter((p) => connected.includes(p.id)),
    [providers, connected],
  );

  const availableProviders = useMemo(() => {
    const available = providers.filter((p) => !connected.includes(p.id));
    if (!searchQuery.trim()) return available;
    const q = searchQuery.toLowerCase();
    return available.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [providers, connected, searchQuery]);

  // ---------------------------------------------------------------------------
  // Connect flow
  // ---------------------------------------------------------------------------

  const openConnectDialog = useCallback(async (providerId: string) => {
    setConnectProviderId(providerId);
    setSelectedMethod(null);
    setApiKeyInput('');
    setIsConnecting(false);
    setOauthMethod(null);
    setOauthVerifier(null);
    setOauthMode(null);
    setOauthCodeInput('');
    setConnectDialogOpen(true);

    try {
      const methods = await window.litho.aiProvider.authMethods(providerId);
      setAuthMethods(methods);
      if (methods.length === 1) {
        setSelectedMethod(methods[0]);
      }
    } catch (err) {
      toast.error('Failed to load auth methods', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const handleApiKeySubmit = useCallback(async () => {
    if (!connectProviderId || !apiKeyInput.trim()) return;
    setIsConnecting(true);
    try {
      await window.litho.aiProvider.connectApiKey(connectProviderId, apiKeyInput.trim());
      toast.success(`Connected to ${connectProviderId}`);
      setConnectDialogOpen(false);
      void refresh();
    } catch (err) {
      toast.error('Failed to connect', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsConnecting(false);
    }
  }, [connectProviderId, apiKeyInput, refresh]);

  const handleOAuthStart = useCallback(async () => {
    if (!connectProviderId || !selectedMethod) return;
    setIsConnecting(true);
    try {
      // Determine mode for Anthropic OAuth
      const mode = selectedMethod.id === 'anthropic-console' ? 'console' : undefined;
      const result = await window.litho.aiProvider.startOAuth(connectProviderId, mode);
      toast.info('Browser opened for authorization. Complete the flow there.');

      if (result.method === 'code') {
        // Anthropic: show code-paste input, don't auto-complete
        setOauthMethod('code');
        setOauthVerifier(result.verifier ?? null);
        setOauthMode(mode ?? 'max');
        setIsConnecting(false);
      } else {
        // OpenAI: auto-redirect flow, wait for callback
        const completeResult = await window.litho.aiProvider.completeOAuth(connectProviderId);
        if (completeResult.success) {
          toast.success(`Connected to ${connectProviderId} via OAuth`);
          setConnectDialogOpen(false);
          void refresh();
        } else {
          toast.error('OAuth flow failed', { description: completeResult.error });
        }
        setIsConnecting(false);
      }
    } catch (err) {
      toast.error('OAuth failed', {
        description: err instanceof Error ? err.message : String(err),
      });
      setIsConnecting(false);
    }
  }, [connectProviderId, selectedMethod, refresh]);

  const handleOAuthCodeSubmit = useCallback(async () => {
    if (!connectProviderId || !oauthCodeInput.trim() || !oauthVerifier) return;
    setIsConnecting(true);
    try {
      const result = await window.litho.aiProvider.completeOAuth(
        connectProviderId,
        oauthCodeInput.trim(),
        oauthVerifier,
        oauthMode ?? undefined,
      );
      if (result.success) {
        toast.success(`Connected to ${connectProviderId} via OAuth`);
        setConnectDialogOpen(false);
        void refresh();
      } else {
        toast.error('OAuth flow failed', { description: result.error });
      }
    } catch (err) {
      toast.error('OAuth failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsConnecting(false);
    }
  }, [connectProviderId, oauthCodeInput, oauthVerifier, oauthMode, refresh]);

  const handleFreeConnect = useCallback(async () => {
    if (!connectProviderId) return;
    setIsConnecting(true);
    try {
      await window.litho.aiProvider.connectFree(connectProviderId);
      toast.success(`Connected to ${connectProviderId} (free tier)`);
      setConnectDialogOpen(false);
      void refresh();
    } catch (err) {
      toast.error('Failed to connect', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsConnecting(false);
    }
  }, [connectProviderId, refresh]);

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  const handleDisconnect = useCallback(
    async (providerId: string) => {
      try {
        await window.litho.aiProvider.disconnect(providerId);
        toast.success(`Disconnected ${providerId}`);
        void refresh();
      } catch (err) {
        toast.error('Failed to disconnect', {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [refresh],
  );

  // ---------------------------------------------------------------------------
  // Model browser
  // ---------------------------------------------------------------------------

  const toggleModelBrowser = useCallback(
    async (providerId: string) => {
      if (expandedProvider === providerId) {
        setExpandedProvider(null);
        setProviderModels([]);
        return;
      }
      setExpandedProvider(providerId);
      setModelsLoading(true);
      try {
        const models = await window.litho.aiProvider.models(providerId);
        setProviderModels(models);
      } catch (err) {
        toast.error('Failed to load models', {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setModelsLoading(false);
      }
    },
    [expandedProvider],
  );

  // ---------------------------------------------------------------------------
  // Ping
  // ---------------------------------------------------------------------------

  const openPingDialog = useCallback(async (providerId: string) => {
    setPingProviderId(providerId);
    setPingModelId('');
    setPingResult(null);
    setIsPinging(false);
    setPingDialogOpen(true);

    try {
      const models = await window.litho.aiProvider.models(providerId);
      setPingModels(models);
      if (models.length > 0) {
        setPingModelId(models[0].id);
      }
    } catch {
      setPingModels([]);
    }
  }, []);

  const handlePing = useCallback(async () => {
    if (!pingProviderId || !pingModelId) return;
    setIsPinging(true);
    setPingResult(null);
    try {
      const result = await window.litho.aiProvider.ping(pingProviderId, pingModelId);
      setPingResult(result);
    } catch (err) {
      toast.error('Ping failed', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsPinging(false);
    }
  }, [pingProviderId, pingModelId]);

  // ---------------------------------------------------------------------------
  // Refresh models.dev
  // ---------------------------------------------------------------------------

  const handleRefreshModelsDev = useCallback(async () => {
    try {
      const result = await window.litho.aiProvider.refreshModelsDev();
      if (result.loaded) {
        toast.success('models.dev data refreshed');
        void refresh();
      } else {
        toast.error('Failed to refresh', { description: result.error ?? undefined });
      }
    } catch (err) {
      toast.error('Failed to refresh models.dev', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [refresh]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Cpu className="h-5 w-5 text-forge" />
          <h1 className="text-lg font-semibold">AI SDK Provider POC</h1>
          {modelsDevLoaded ? (
            <Badge variant="outline" className="text-green-600">
              <Check className="mr-1 h-3 w-3" />
              models.dev loaded ({providers.length} providers)
            </Badge>
          ) : (
            <Badge variant="destructive">models.dev error: {modelsDevError ?? 'not loaded'}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshModelsDev}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-8">
          {/* Connected Providers */}
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Connected Providers ({connectedProviders.length})
            </h2>
            {connectedProviders.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No providers connected yet. Connect one below.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {connectedProviders.map((p) => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-3 text-left"
                        onClick={() => toggleModelBrowser(p.id)}
                      >
                        {expandedProvider === p.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Activity className="h-4 w-4 text-green-500" />
                        <span className="font-medium">{p.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {p.modelCount} models
                        </Badge>
                      </button>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openPingDialog(p.id)}>
                          <Zap className="mr-1 h-3.5 w-3.5" />
                          Ping
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDisconnect(p.id)}
                        >
                          <LogOut className="mr-1 h-3.5 w-3.5" />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                    {expandedProvider === p.id && (
                      <ModelBrowser models={providerModels} loading={modelsLoading} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Available Providers */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                Available Providers ({availableProviders.length})
              </h2>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search providers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {availableProviders.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-3 text-left"
                      onClick={() => toggleModelBrowser(p.id)}
                    >
                      {expandedProvider === p.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Unplug className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{p.id}</span>
                      <Badge variant="outline" className="text-xs">
                        {p.modelCount} models
                      </Badge>
                    </button>
                    <Button variant="outline" size="sm" onClick={() => openConnectDialog(p.id)}>
                      <Key className="mr-1 h-3.5 w-3.5" />
                      Connect
                    </Button>
                  </div>
                  {expandedProvider === p.id && (
                    <ModelBrowser models={providerModels} loading={modelsLoading} />
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Connect Dialog */}
      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Connect to{' '}
              {providers.find((p) => p.id === connectProviderId)?.name ?? connectProviderId}
            </DialogTitle>
            <DialogDescription>Choose an authentication method</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {!selectedMethod && authMethods.length > 1 && (
              <div className="flex flex-col gap-2">
                {authMethods.map((method) => (
                  <Button
                    key={method.label}
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      if (method.type === 'free') {
                        setSelectedMethod(method);
                        return;
                      }
                      setSelectedMethod(method);
                    }}
                  >
                    {method.type === 'oauth' ? (
                      <Activity className="mr-2 h-4 w-4" />
                    ) : method.type === 'free' ? (
                      <Zap className="mr-2 h-4 w-4" />
                    ) : (
                      <Key className="mr-2 h-4 w-4" />
                    )}
                    {method.label}
                  </Button>
                ))}
              </div>
            )}

            {selectedMethod?.type === 'api' && (
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="sk-..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleApiKeySubmit();
                    }}
                    autoFocus
                  />
                </div>
                <Button onClick={handleApiKeySubmit} disabled={isConnecting || !apiKeyInput.trim()}>
                  {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect
                </Button>
              </div>
            )}

            {selectedMethod?.type === 'oauth' && oauthMethod !== 'code' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {connectProviderId === 'anthropic'
                    ? 'This will open your browser for authentication. After authorizing, copy the code and paste it back here.'
                    : "This will open your browser for authentication. Complete the flow there and you'll be redirected back automatically."}
                </p>
                <Button onClick={handleOAuthStart} disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Waiting for authorization...
                    </>
                  ) : (
                    <>
                      <Activity className="mr-2 h-4 w-4" />
                      Open Browser
                    </>
                  )}
                </Button>
              </div>
            )}

            {selectedMethod?.type === 'oauth' && oauthMethod === 'code' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Paste the authorization code from your browser below.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="oauth-code">Authorization Code</Label>
                  <Input
                    id="oauth-code"
                    type="text"
                    placeholder="Paste code here..."
                    value={oauthCodeInput}
                    onChange={(e) => setOauthCodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleOAuthCodeSubmit();
                    }}
                    autoFocus
                  />
                </div>
                <Button
                  onClick={handleOAuthCodeSubmit}
                  disabled={isConnecting || !oauthCodeInput.trim()}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Submit Code
                    </>
                  )}
                </Button>
              </div>
            )}

            {selectedMethod?.type === 'free' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  Connect to free models instantly — no API key required.
                </p>
                <Button onClick={handleFreeConnect} disabled={isConnecting}>
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Connect Free
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Ping Dialog */}
      <Dialog open={pingDialogOpen} onOpenChange={setPingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ping {providers.find((p) => p.id === pingProviderId)?.name ?? pingProviderId}
            </DialogTitle>
            <DialogDescription>
              Send a test message to verify the connection works
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={pingModelId} onValueChange={setPingModelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {pingModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handlePing} disabled={isPinging || !pingModelId}>
              {isPinging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Pinging...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  Send Ping
                </>
              )}
            </Button>
            {pingResult && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Response:</span>
                    <span className="font-mono font-medium">
                      {pingResult.text || (
                        <span className="text-muted-foreground italic">empty</span>
                      )}
                    </span>
                  </div>
                  {pingResult.reasoning && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reasoning:</span>
                      <span className="max-w-[260px] truncate font-mono text-xs">
                        {pingResult.reasoning}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-mono">{pingResult.modelId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Finish reason:</span>
                    <span className="font-mono">{pingResult.finishReason}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latency:</span>
                    <span className="font-mono">{pingResult.latencyMs}ms</span>
                  </div>
                  {pingResult.error && (
                    <div className="flex flex-col gap-1">
                      <span className="text-destructive text-xs font-medium">Stream error:</span>
                      <span className="rounded bg-destructive/10 p-2 font-mono text-xs text-destructive break-all">
                        {pingResult.error}
                      </span>
                    </div>
                  )}
                  {pingResult.usage && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Prompt tokens:</span>
                        <span className="font-mono">{pingResult.usage.promptTokens}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completion tokens:</span>
                        <span className="font-mono">{pingResult.usage.completionTokens}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model browser sub-component
// ---------------------------------------------------------------------------

function ModelBrowser({
  models,
  loading,
}: {
  models: ModelInfo[];
  loading: boolean;
}): React.JSX.Element {
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading models...
      </div>
    );
  }

  if (models.length === 0) {
    return <div className="px-4 py-3 text-sm text-muted-foreground">No models available</div>;
  }

  return (
    <div className="ml-8 border-l">
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-medium">Model</th>
              <th className="px-3 py-1.5 font-medium">Context</th>
              <th className="px-3 py-1.5 font-medium">Max Output</th>
              <th className="px-3 py-1.5 font-medium">Cost (in/out)</th>
              <th className="px-3 py-1.5 font-medium">Capabilities</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="px-3 py-1.5">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-muted-foreground">{m.id}</div>
                </td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">
                  {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k` : '-'}
                </td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">
                  {m.maxOutput ? `${(m.maxOutput / 1000).toFixed(0)}k` : '-'}
                </td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">
                  {m.inputCost !== undefined
                    ? `$${m.inputCost.toFixed(2)}/$${m.outputCost?.toFixed(2) ?? '?'}`
                    : '-'}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {m.capabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-[10px] px-1 py-0">
                        {cap}
                      </Badge>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { DebugAiSdkPage };
