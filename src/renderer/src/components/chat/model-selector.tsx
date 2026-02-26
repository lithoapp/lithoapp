import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { OpencodeClient } from '@/lib/opencode-client-types';

interface ProviderOption {
  id: string;
  name: string;
  models: Record<string, { id: string; name: string }>;
}

export function ModelSelector({
  client,
  providerId,
  modelId,
  onSelect,
}: {
  client: OpencodeClient | null;
  providerId: string;
  modelId: string;
  onSelect: (providerId: string, modelId: string) => void;
}): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Fetch providers
  useEffect(() => {
    if (!client) return;
    setLoading(true);
    client.provider
      .list()
      .then(({ data }) => {
        if (data) {
          setProviders(data.all);
          setConnectedIds(data.connected);
        }
      })
      .catch(() => toast.error('Failed to load models'))
      .finally(() => setLoading(false));
  }, [client]);

  const connectedProviders = useMemo(
    () => providers.filter((p) => connectedIds.includes(p.id)),
    [providers, connectedIds],
  );

  const selectedModels = useMemo(() => {
    const provider = connectedProviders.find((p) => p.id === providerId);
    return provider ? Object.values(provider.models) : [];
  }, [connectedProviders, providerId]);

  const displayName = useMemo(() => {
    if (!modelId) return 'Select model';
    const provider = connectedProviders.find((p) => p.id === providerId);
    if (!provider) return modelId;
    const model = provider.models[modelId];
    return model ? model.name : modelId;
  }, [connectedProviders, providerId, modelId]);

  const handleProviderChange = (newProviderId: string) => {
    onSelect(newProviderId, '');
  };

  const handleModelChange = (newModelId: string) => {
    onSelect(providerId, newModelId);
  };

  if (loading) {
    return (
      <Button size="sm" variant="ghost" className="h-6 text-xs" disabled>
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Loading...
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 text-xs font-mono">
          {displayName}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex flex-col gap-2">
          <div>
            <span className="text-[10px] text-muted-foreground">Provider</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              value={providerId}
              onChange={(e) => handleProviderChange(e.target.value)}
            >
              <option value="">-- select --</option>
              {connectedProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground">Model</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              value={modelId}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={!providerId}
            >
              <option value="">-- select --</option>
              {selectedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
