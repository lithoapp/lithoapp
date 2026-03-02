import { ChevronDown, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderInfo {
  id: string;
  name: string;
}

interface ModelInfo {
  id: string;
  name: string;
}

interface ModelSelectorProps {
  providerId: string;
  modelId: string;
  onSelect: (providerId: string, modelId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelector({
  providerId,
  modelId,
  onSelect,
}: ModelSelectorProps): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const data = await window.litho.aiProvider.list();
        setProviders(data.providers);
        setConnectedIds(data.connected);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const connectedProviders = useMemo(
    () => providers.filter((p) => connectedIds.includes(p.id)),
    [providers, connectedIds],
  );

  useEffect(() => {
    if (!providerId) {
      setModels([]);
      return;
    }
    void (async () => {
      try {
        const result = await window.litho.aiProvider.models(providerId);
        setModels(result);
      } catch {
        setModels([]);
      }
    })();
  }, [providerId]);

  const currentModel = models.find((m) => m.id === modelId);
  const displayName = currentModel?.name ?? modelId ?? 'Select model';

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-1.5 font-mono text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 font-mono text-xs">
          {displayName}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Provider</span>
          <Select
            value={providerId}
            onValueChange={(pid) => {
              const firstModel = models[0]?.id ?? '';
              onSelect(pid, firstModel);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
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
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Model</span>
          <Select value={modelId} onValueChange={(mid) => onSelect(providerId, mid)}>
            <SelectTrigger className="h-8 text-xs">
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
      </PopoverContent>
    </Popover>
  );
}
