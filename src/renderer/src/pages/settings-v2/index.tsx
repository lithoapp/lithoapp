import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AboutSection } from './about-section';
import { AdvancedSection } from './advanced-section';
import { AiProvidersSection } from './ai-providers-section';
import { PrivacySection } from './privacy-section';
import { ProfileSection } from './profile-section';

export type SettingsCategory = 'profile' | 'ai-providers' | 'privacy' | 'about' | 'advanced';

const categories: { id: SettingsCategory; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'ai-providers', label: 'AI Providers' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'about', label: 'About' },
  { id: 'advanced', label: 'Advanced' },
];

interface SettingsV2PageProps {
  onBack: () => void;
  initialCategory?: SettingsCategory;
}

export function SettingsV2Page({
  onBack,
  initialCategory,
}: SettingsV2PageProps): React.JSX.Element {
  const [active, setActive] = useState<SettingsCategory>(initialCategory ?? 'profile');

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col gap-1 border-r bg-card px-3 py-6">
        <div className="mb-4 flex items-center gap-1 px-1">
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
            onClick={onBack}
          >
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>
        </div>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            aria-current={active === cat.id ? 'page' : undefined}
            onClick={() => setActive(cat.id)}
            className={cn(
              'rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
              active === cat.id
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
            )}
          >
            {cat.label}
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-auto p-8">
        {active === 'profile' && <ProfileSection />}
        {active === 'ai-providers' && <AiProvidersSection />}
        {active === 'privacy' && <PrivacySection />}
        {active === 'about' && <AboutSection />}
        {active === 'advanced' && <AdvancedSection />}
      </main>
    </div>
  );
}
