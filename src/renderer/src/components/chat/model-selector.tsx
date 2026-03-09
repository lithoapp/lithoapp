import { Check, ChevronDown, Loader2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNavigation } from '@/lib/navigation-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderInfo {
  id: string;
  name: string;
  defaultModel: string;
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

interface ProviderModels {
  provider: ProviderInfo;
  models: ModelInfo[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelSelector({
  providerId,
  modelId,
  onSelect,
}: ModelSelectorProps): React.JSX.Element {
  const navigation = useNavigation();
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connectedIds, setConnectedIds] = useState<string[]>([]);
  const [providerModels, setProviderModels] = useState<ProviderModels[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch providers on mount
  useEffect(() => {
    void (async () => {
      try {
        const data = await window.litho.aiProvider.list();
        setProviders(data.providers);
        setConnectedIds(data.connected);
        if (!providerId) {
          const first = data.providers.find((p) => data.connected.includes(p.id));
          if (first) onSelect(first.id, first.defaultModel);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [onSelect, providerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectedProviders = useMemo(
    () => providers.filter((p) => connectedIds.includes(p.id)),
    [providers, connectedIds],
  );

  const hasOnlyFreeModels = useMemo(
    () => connectedProviders.length > 0 && connectedProviders.every((p) => p.id === 'free'),
    [connectedProviders],
  );

  // Fetch models for all connected providers on mount + refresh when popover opens
  useEffect(() => {
    if (connectedProviders.length === 0) return;

    void (async () => {
      const results = await Promise.all(
        connectedProviders.map(async (provider) => {
          try {
            const models = await window.litho.aiProvider.models(provider.id);
            return { provider, models } satisfies ProviderModels;
          } catch {
            return { provider, models: [] } satisfies ProviderModels;
          }
        }),
      );
      setProviderModels(results.filter((r) => r.models.length > 0));
    })();
  }, [connectedProviders]);

  // Resolve display name for the trigger
  const displayName = useMemo(() => {
    for (const group of providerModels) {
      const match = group.models.find((m) => m.id === modelId);
      if (match) return match.name;
    }
    return modelId || 'Select model';
  }, [providerModels, modelId]);

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-1.5 font-mono text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading...
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 font-mono text-xs">
          {displayName}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            {providerModels.map(({ provider, models }) => (
              <CommandGroup key={provider.id} heading={provider.name}>
                {models.map((model) => {
                  const isSelected = providerId === provider.id && modelId === model.id;
                  return (
                    <CommandItem
                      key={model.id}
                      value={`${provider.name} ${model.name}`}
                      className={isSelected ? 'bg-primary/10 text-primary' : ''}
                      onSelect={() => {
                        onSelect(provider.id, model.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-primary' : 'opacity-0'}`}
                      />
                      <span className="flex-1 truncate">{model.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            {hasOnlyFreeModels && (
              <div className="my-1 flex justify-center p-1">
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  onClick={() => {
                    setOpen(false);
                    navigation.openSettings('ai-providers');
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add AI provider
                </button>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
