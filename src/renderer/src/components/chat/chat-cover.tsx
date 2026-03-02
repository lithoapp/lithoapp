import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModelSelector } from './model-selector';

// ---------------------------------------------------------------------------
// Design wand icon (same SVG from original chat-cover)
// ---------------------------------------------------------------------------

function DesignWandIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="Design wand">
      <rect
        x="2.3"
        y="18.38"
        width="43.39"
        height="11.24"
        rx="2"
        transform="translate(24 -9.94) rotate(45)"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="27.97"
        y1="20.03"
        x2="24.28"
        y2="23.72"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="14.9"
        y1="6.95"
        x2="11.21"
        y2="10.64"
        className="stroke-primary/60"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="19.26"
        y1="11.31"
        x2="17.21"
        y2="13.36"
        className="stroke-primary/60"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="23.62"
        y1="15.67"
        x2="21.56"
        y2="17.72"
        className="stroke-primary/60"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="41.05"
        y1="33.1"
        x2="37.36"
        y2="36.79"
        className="stroke-primary/60"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="32.33"
        y1="24.38"
        x2="30.28"
        y2="26.44"
        className="stroke-primary/60"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="36.69"
        y1="28.74"
        x2="34.64"
        y2="30.79"
        className="stroke-primary/60"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M24,16.05l3.63-3.63a3.89,3.89,0,0,1,1.47-.92l9-3.11a1.22,1.22,0,0,1,1.55,1.55l-3.11,9a3.89,3.89,0,0,1-.92,1.47L32,24"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24,32l-10,10a1.94,1.94,0,0,1-2.75,0l-5.2-5.2a1.94,1.94,0,0,1,0-2.75l10-10"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="8.37"
        y1="31.68"
        x2="16.32"
        y2="39.63"
        className="stroke-primary/40"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="27.2"
        y1="12.85"
        x2="35.15"
        y2="20.8"
        className="stroke-primary/40"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Chat cover — kickoff screen
// ---------------------------------------------------------------------------

export function ChatCover({
  providerId,
  modelId,
  onModelSelect,
  onStart,
}: {
  providerId: string;
  modelId: string;
  onModelSelect: (providerId: string, modelId: string) => void;
  onStart: () => void;
}): React.JSX.Element {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 overflow-hidden p-8">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-stone-100 via-stone-50 to-background dark:from-stone-900 dark:via-stone-950 dark:to-background" />

      {/* Dot grid texture */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.02]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      {/* Ambient glow — bottom */}
      <div className="absolute -bottom-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      {/* Ambient glow — top corner */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Content */}
      <div className="relative flex flex-col items-center gap-3">
        <DesignWandIcon className="h-16 w-16" />
        <p className="text-base text-muted-foreground">Your creative design partner</p>
      </div>

      <div className="relative">
        <ModelSelector providerId={providerId} modelId={modelId} onSelect={onModelSelect} />
      </div>

      <div className="relative">
        <div className="absolute -inset-3 animate-pulse rounded-2xl bg-primary/20" />
        <Button
          size="lg"
          className="relative gap-2.5 rounded-xl px-10 py-6 text-lg"
          onClick={onStart}
        >
          <Sparkles className="h-5 w-5" />
          Start
        </Button>
      </div>
    </div>
  );
}
