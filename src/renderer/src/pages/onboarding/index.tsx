import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LithoLogo } from '@/components/litho-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { validateName, validateOptionalEmail } from '../../../../shared/user-profile-validation';
import { ProviderPicker } from './provider-picker';

interface OnboardingPageProps {
  onComplete: (name: string, email: string, telemetryEnabled: boolean) => Promise<void>;
}

const FEATURES = [
  'Design with AI — use your own subscriptions',
  'Your files never leave your machine',
  'One click to PDF, PNG, or JPG',
];

function getStep1Errors(name: string, email: string): { name?: string; email?: string } {
  return {
    name: validateName(name),
    email: validateOptionalEmail(email),
  };
}

export function OnboardingPage({ onComplete }: OnboardingPageProps): React.JSX.Element {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [telemetryEnabled, setTelemetryEnabled] = useState(true);
  const [touched, setTouched] = useState<{ name: boolean; email: boolean }>({
    name: false,
    email: false,
  });
  const [didAttemptContinue, setDidAttemptContinue] = useState(false);
  const [totalModels, setTotalModels] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);
  const errors = getStep1Errors(name, email);
  const canContinue = !errors.name && !errors.email;

  function validateStep1(): boolean {
    setDidAttemptContinue(true);
    setTouched({ name: true, email: true });
    return canContinue;
  }

  function handleContinue(): void {
    if (validateStep1()) setStep(2);
  }

  async function handleFinish(): Promise<void> {
    setIsFinishing(true);
    try {
      await onComplete(name.trim(), email.trim(), telemetryEnabled);
    } catch {
      toast.error('Failed to save your profile. Please try again.');
      setIsFinishing(false);
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Brand panel ─────────────────────────────── */}
      <div className="relative flex w-[38%] shrink-0 flex-col items-center justify-center overflow-hidden border-r border-border bg-background px-10 py-12">
        {/* Gradient overlay - left side fades to transparent on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-stone-100 via-stone-100/50 to-transparent dark:from-stone-900 dark:via-stone-900/50 dark:to-transparent" />
        {/* Dot grid texture - light mode */}
        <div
          className="absolute inset-0 opacity-[0.06] dark:hidden"
          style={{
            backgroundImage: 'radial-gradient(rgb(0 0 0) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Dot grid texture - dark mode */}
        <div
          className="absolute inset-0 hidden opacity-[0.025] dark:block"
          style={{
            backgroundImage: 'radial-gradient(rgb(255 255 255) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Ambient glow – bottom-left */}
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-forge/15 blur-3xl" />
        {/* Ambient glow – top-right */}
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-amber/8 blur-3xl" />

        {/* Content */}
        <div className="relative flex flex-col items-center gap-8 text-center">
          <LithoLogo className="h-16 w-auto" />

          <div className="flex flex-col gap-2">
            <h2 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Litho
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Describe it. Design it. Export it.
            </p>
          </div>

          <ul className="flex flex-col gap-3.5 text-left">
            {FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2.5 text-sm text-stone-500 dark:text-stone-400"
              >
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-forge" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="absolute bottom-7 text-[11px] text-stone-400 dark:text-stone-600">
          Crafted with love. Yours entirely.
        </p>
      </div>

      {/* ── Form panel ──────────────────────────────── */}
      <div className="relative flex flex-1 flex-col justify-center px-14 py-12">
        {/* Step progress */}
        <div className="mb-10 flex gap-2">
          <div className="h-1 w-10 rounded-full bg-forge" />
          <div
            className={cn(
              'h-1 w-10 rounded-full transition-colors duration-300',
              step === 2 ? 'bg-forge' : 'bg-stone-300 dark:bg-stone-700',
            )}
          />
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-8">
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
              Welcome to Litho
            </h1>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="onb-name" className="text-base">
                  Your name
                </Label>
                <Input
                  id="onb-name"
                  placeholder="Ada Lovelace"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, name: true }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                  className="h-12 px-4 text-base"
                  aria-invalid={(touched.name || didAttemptContinue) && !!errors.name}
                  autoFocus
                />
                {(touched.name || didAttemptContinue) && errors.name && (
                  <p className="text-sm text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="onb-email" className="text-base">
                  Email <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="onb-email"
                  type="email"
                  placeholder="ada@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((current) => ({ ...current, email: true }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                  className="h-12 px-4 text-base"
                  aria-invalid={(touched.email || didAttemptContinue) && !!errors.email}
                />
                {(touched.email || didAttemptContinue) && errors.email && (
                  <p className="text-sm text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="onb-telemetry" className="text-base font-medium">
                    Help improve Litho
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Send automatic crash reports. You can still send manual feedback later.
                  </p>
                </div>
                <Switch
                  id="onb-telemetry"
                  checked={telemetryEnabled}
                  onCheckedChange={setTelemetryEnabled}
                />
              </div>
            </div>

            <Button
              onClick={handleContinue}
              disabled={!canContinue}
              className="h-12 w-full text-base"
            >
              Continue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex min-h-0 flex-1 flex-col gap-6">
            <div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mb-3 flex items-center gap-1 text-base text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
                Connect AI
              </h1>
              <p className="mt-2 text-base text-muted-foreground">
                Free models included. Add your own anytime in Settings.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <ProviderPicker onModelsChange={setTotalModels} />
            </div>

            <Button
              onClick={() => void handleFinish()}
              disabled={isFinishing}
              className="h-12 w-full text-base"
            >
              {isFinishing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {isFinishing
                ? 'Setting up...'
                : totalModels > 0
                  ? `Start with ${totalModels} models`
                  : 'Start using Litho'}
              {!isFinishing && <ArrowRight className="ml-1.5 h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
