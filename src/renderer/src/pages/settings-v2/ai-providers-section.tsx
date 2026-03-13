import { ProviderList } from '@/pages/settings/provider-list';

export function AiProvidersSection(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">AI Providers</h2>
        <p className="text-sm text-muted-foreground">
          Connect AI providers and manage your models. Expand a connected provider to set your
          default model.
        </p>
      </div>

      <ProviderList />
    </div>
  );
}
