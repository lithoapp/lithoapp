import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MIN_DISPLAY_MS = 500;

interface WorkspaceTransitionPageProps {
  mode: 'loading' | 'closing';
  workspaceName?: string;
  onComplete: () => void;
}

export function WorkspaceTransitionPage({
  mode,
  workspaceName,
  onComplete,
}: WorkspaceTransitionPageProps): React.JSX.Element {
  const [canFinish, setCanFinish] = useState(false);
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    const elapsed = Date.now() - mountedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    const timer = setTimeout(() => setCanFinish(true), remaining);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (canFinish) {
      onComplete();
    }
  }, [canFinish, onComplete]);

  const title =
    mode === 'loading'
      ? workspaceName
        ? `Opening ${workspaceName}...`
        : 'Opening...'
      : 'Closing...';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-16 w-16 animate-ping rounded-full bg-forge/10" />
        <Loader2 className="h-10 w-10 animate-spin text-forge" />
      </div>

      <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}
