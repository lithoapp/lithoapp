import { AlertCircle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProviderInfo } from '@/hooks/use-provider-list';
import { loadChatPrefs, saveChatPrefs } from '@/lib/chat-prefs';
import { ProviderList } from '@/pages/settings/provider-list';

interface ModelEntry {
  id: string;
  name: string;
}

function DefaultModelSelector(): React.JSX.Element {
  const [providerId, setProviderId] = useState('');
  const [modelId, setModelId] = useState('');
  const [connectedProviders, setConnectedProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const prefs = loadChatPrefs();
    setProviderId(prefs.providerId);
    setModelId(prefs.modelId);
  }, []);

  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const result = await window.litho.aiProvider.list();
      const connected = result.providers.filter((p) => result.connected.includes(p.id));
      setConnectedProviders(connected);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  // Fetch models when provider changes
  useEffect(() => {
    if (!providerId) {
      setModels([]);
      return;
    }
    window.litho.aiProvider
      .models(providerId)
      .then((list) => setModels(list.map((m) => ({ id: m.id, name: m.name }))))
      .catch(() => setModels([]));
  }, [providerId]);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Failed to load providers
        <Button
          variant="outline"
          className="h-10 px-4 text-sm"
          onClick={() => void fetchProviders()}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading providers...
      </div>
    );
  }

  function handleProviderChange(newProviderId: string): void {
    setProviderId(newProviderId);
    setModelId('');
    saveChatPrefs({ providerId: newProviderId, modelId: '' });
  }

  function handleModelChange(newModelId: string): void {
    setModelId(newModelId);
    saveChatPrefs({ providerId, modelId: newModelId });
  }

  if (connectedProviders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a provider below to set a default model.
      </p>
    );
  }

  return (
    <div className="flex gap-4">
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Provider</span>
        <Select value={providerId} onValueChange={handleProviderChange}>
          <SelectTrigger className="h-11 w-full text-sm">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {connectedProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <span className="text-sm text-muted-foreground">Model</span>
        <Select value={modelId} onValueChange={handleModelChange} disabled={!providerId}>
          <SelectTrigger className="h-11 w-full text-sm">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function AiProvidersSection(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold">AI Providers</h2>
        <p className="text-sm text-muted-foreground">
          Connect AI providers and set your default model.
        </p>
      </div>

      <div className="flex max-w-lg flex-col gap-3">
        <h3 className="text-sm font-medium">Default model</h3>
        <DefaultModelSelector />
      </div>

      <ProviderList />
    </div>
  );
}
