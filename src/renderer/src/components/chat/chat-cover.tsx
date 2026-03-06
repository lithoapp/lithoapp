import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AgentId } from '../../../../shared/types';
import { ModelSelector } from './model-selector';

// ---------------------------------------------------------------------------
// Agent metadata
// ---------------------------------------------------------------------------

const AGENT_META: Record<AgentId, { name: string; description: string }> = {
  document: {
    name: 'Page Designer',
    description: 'Design and build beautiful PDF pages',
  },
  'design-system': {
    name: 'Brand Designer',
    description: 'Shape your visual identity and design tokens',
  },
  workspace: {
    name: 'Project Assistant',
    description: 'Manage your workspace and documents',
  },
};

// ---------------------------------------------------------------------------
// Chat cover — kickoff screen
// ---------------------------------------------------------------------------

export function ChatCover({
  agentId,
  providerId,
  modelId,
  onModelSelect,
  onStart,
}: {
  agentId: AgentId;
  providerId: string;
  modelId: string;
  onModelSelect: (providerId: string, modelId: string) => void;
  onStart: () => void;
}): React.JSX.Element {
  const meta = AGENT_META[agentId];

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-8">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.04] via-background to-background dark:from-primary/[0.06]" />
      <div className="absolute top-0 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/10 blur-3xl" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-8">
        {/* Agent identity */}
        <div className="flex flex-col items-center gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight">{meta.name}</h2>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>

        {/* Model selector — prominent */}
        <div className="rounded-lg border bg-card px-1 py-1">
          <ModelSelector providerId={providerId} modelId={modelId} onSelect={onModelSelect} />
        </div>

        {/* Start */}
        <Button size="lg" className="gap-2 rounded-xl px-8" onClick={onStart}>
          Start
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
