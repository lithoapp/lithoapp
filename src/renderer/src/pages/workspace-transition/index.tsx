import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

const MIN_DISPLAY_MS = 500;

interface WorkspaceTransitionPageProps {
  mode: 'loading' | 'closing';
  workspaceName?: string | null;
  /** When true the transition is done (workspace is active/inactive). */
  ready: boolean;
  /** Called when the user wants to go back to the workspaces list. */
  onBack?: () => void;
  onComplete: () => void;
}

export function WorkspaceTransitionPage({
  mode,
  workspaceName,
  ready,
  onBack,
  onComplete,
}: WorkspaceTransitionPageProps): React.JSX.Element {
  const [canFinish, setCanFinish] = useState(false);
  const mountedAt = useRef(Date.now());

  // Enforce a minimum display time so the transition feels intentional.
  useEffect(() => {
    const elapsed = Date.now() - mountedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    const timer = setTimeout(() => setCanFinish(true), remaining);
    return () => clearTimeout(timer);
  }, []);

  // Navigate once both the transition is done AND the minimum time has passed.
  useEffect(() => {
    if (ready && canFinish) {
      onComplete();
    }
  }, [ready, canFinish, onComplete]);

  const title =
    mode === 'loading'
      ? workspaceName
        ? `Opening ${workspaceName}...`
        : 'Opening...'
      : 'Closing...';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      {/* Glowing spinner ring */}
      <div className="relative flex items-center justify-center">
        <div className="absolute h-16 w-16 animate-ping rounded-full bg-forge/10" />
        <Loader2 className="h-10 w-10 animate-spin text-forge" />
      </div>

      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>

      {onBack && mode === 'loading' && (
        <Button variant="outline" onClick={onBack} className="h-11 px-5 text-base">
          Back to Projects
        </Button>
      )}
    </div>
  );
}
