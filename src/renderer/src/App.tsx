import { Files, FlaskConical, Home, Images, Loader2, Palette, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/hooks/use-workspace';
import { cn } from '@/lib/utils';
import type { DocumentInfo } from '../../shared/types';
import { AssetsPage } from './pages/assets';
import { DesignSystemDocPage } from './pages/design-system-doc';
import { DocumentPage } from './pages/document';
import { DocumentsPage } from './pages/documents';
import { OnboardingPage } from './pages/onboarding';
import { RendererPocPage } from './pages/renderer-poc';
import { SettingsV2Page } from './pages/settings-v2';
import { WorkspaceTransitionPage } from './pages/workspace-transition';
import { WorkspacesPage } from './pages/workspaces';

type Page =
  | 'workspaces'
  | 'documents'
  | 'document'
  | 'design-system-doc'
  | 'assets'
  | 'settings'
  | 'renderer-poc'
  | 'workspace-loading'
  | 'workspace-closing';

function App(): React.JSX.Element {
  const [version, setVersion] = useState('');
  const [page, setPage] = useState<Page>('workspaces');
  const [activeDocSlug, setActiveDocSlug] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [userProfile, setUserProfile] = useState<{
    name: string | null;
    email: string | null;
  } | null>(null);

  const { info: workspaceInfo, workspaces, refreshWorkspaces } = useWorkspace();
  const workspaceName = workspaceInfo.workspaceName;
  const workspacePath = workspaceInfo.workspacePath;

  const loadDocuments = useCallback(async () => {
    if (!workspaceName) {
      setDocuments([]);
      return;
    }
    try {
      const docs = await window.litho.document.list(workspaceName);
      setDocuments(docs);
    } catch (err) {
      console.error('[app] Failed to load documents:', err);
      toast.error('Failed to load documents');
    }
  }, [workspaceName]);

  // Load documents when workspace becomes active
  useEffect(() => {
    if (workspaceInfo.status === 'active') {
      loadDocuments();
    } else {
      setDocuments([]);
    }
  }, [workspaceInfo.status, loadDocuments]);

  useEffect(() => {
    void (async () => {
      try {
        setVersion(await window.litho.app.getVersion());
      } catch (err) {
        console.error('[app] Failed to get version:', err);
        toast.error('Failed to fetch app version');
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setUserProfile(await window.litho.preferences.getUserProfile());
      } catch (err) {
        console.error('[app] Failed to get user profile:', err);
        setUserProfile({ name: null, email: null });
      }
    })();
  }, []);

  const [onboardingPhase, setOnboardingPhase] = useState<
    'active' | 'fading' | 'transition' | 'done'
  >('active');

  const handleOnboardingComplete = useCallback(
    async (name: string, email: string, telemetryEnabled: boolean) => {
      await window.litho.preferences.setUserProfile(name, email);
      await window.litho.telemetry.setEnabled(telemetryEnabled);
      // Phase 1: fade out onboarding
      setOnboardingPhase('fading');
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Phase 2: show spinner transition
      setOnboardingPhase('transition');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      // Phase 3: reveal home screen
      setOnboardingPhase('done');
      setUserProfile({ name, email });
    },
    [],
  );

  // Guard: redirect away from workspace pages if workspace is no longer active
  useEffect(() => {
    const onWorkspacePage = [
      'documents',
      'document',
      'design-system-doc',
      'assets',
      'renderer-poc',
    ].includes(page);
    if (onWorkspacePage && workspaceInfo.status === 'inactive') {
      setPage('workspaces');
    }
  }, [page, workspaceInfo.status]);

  const handleCloseWorkspace = useCallback(async () => {
    setPage('workspace-closing');
    try {
      await window.litho.workspace.stop();
      await refreshWorkspaces();
    } catch (err) {
      console.error('[app] Failed to stop workspace:', err);
      toast.error('Failed to close workspace');
    }
  }, [refreshWorkspaces]);

  const activeDoc = activeDocSlug
    ? (documents.find((d) => d.slug === activeDocSlug) ?? null)
    : null;

  // Still loading user profile — render minimal drag region to avoid flash
  if (userProfile === null) {
    return (
      <div className="h-10 w-full" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
    );
  }

  // First launch — show onboarding or transition
  if (!userProfile.name) {
    if (onboardingPhase === 'transition') {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-6">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-16 w-16 animate-ping rounded-full bg-forge/10" />
            <Loader2 className="h-10 w-10 animate-spin text-forge" />
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Setting up...</h2>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'flex h-screen flex-col transition-opacity duration-300',
          onboardingPhase === 'fading' ? 'opacity-0' : 'opacity-100',
        )}
      >
        <div
          className="flex h-10 w-full shrink-0 items-center justify-end pr-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <ThemeSwitcher />
          </div>
        </div>
        <OnboardingPage onComplete={handleOnboardingComplete} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Title bar drag region */}
      <div
        className="flex h-10 shrink-0 items-center border-b border-border pl-[70px] pr-4"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-semibold">Litho</span>
        {version && <span className="ml-2 text-xs text-muted-foreground">v{version}</span>}
        {workspaceInfo.status === 'active' && workspaceName && (
          <>
            <span className="mx-2 text-xs text-muted-foreground">/</span>
            <span className="text-sm font-medium">{workspaceName}</span>
          </>
        )}

        <nav
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {workspaceInfo.status === 'active' ? (
            <>
              <Button
                variant={page === 'documents' || page === 'document' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setPage('documents')}
              >
                <Files className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={page === 'design-system-doc' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setPage('design-system-doc')}
              >
                <Palette className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={page === 'assets' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setPage('assets')}
              >
                <Images className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={page === 'renderer-poc' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setPage('renderer-poc')}
              >
                <FlaskConical className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={page === 'settings' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setPage('settings')}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant={page === 'workspaces' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setPage('workspaces')}
              >
                <Home className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={page === 'settings' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setPage('settings')}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <div className="mx-1 h-4 w-px bg-border" />
          <ThemeSwitcher />
        </nav>
      </div>

      {/* Main content */}
      <div
        className={`flex-1 ${page === 'document' || page === 'design-system-doc' || page === 'workspace-loading' || page === 'workspace-closing' || page === 'settings' || page === 'assets' || page === 'renderer-poc' ? 'overflow-hidden' : 'overflow-auto p-6'}`}
      >
        {page === 'workspaces' && (
          <WorkspacesPage
            workspaces={workspaces}
            activeInfo={workspaceInfo}
            onWorkspaceSelected={() => setPage('workspace-loading')}
            refreshWorkspaces={refreshWorkspaces}
            userName={userProfile.name ?? undefined}
          />
        )}
        {page === 'workspace-loading' && (
          <WorkspaceTransitionPage
            mode="loading"
            workspaceName={workspaceInfo.workspaceName}
            ready={workspaceInfo.status === 'active'}
            onBack={() => setPage('workspaces')}
            onComplete={() => setPage('documents')}
          />
        )}
        {page === 'workspace-closing' && (
          <WorkspaceTransitionPage
            mode="closing"
            workspaceName={workspaceInfo.workspaceName}
            ready={workspaceInfo.status === 'inactive'}
            onComplete={() => setPage('workspaces')}
          />
        )}
        {page === 'documents' && workspaceName && (
          <DocumentsPage
            workspaceName={workspaceName}
            documents={documents}
            refetch={loadDocuments}
            onSelectDocument={(slug) => {
              setActiveDocSlug(slug);
              setPage('document');
            }}
            onOpenDesignSystem={() => setPage('design-system-doc')}
            onOpenAssets={() => setPage('assets')}
            onCloseWorkspace={handleCloseWorkspace}
          />
        )}
        {page === 'assets' && workspaceName && (
          <AssetsPage workspaceName={workspaceName} onBack={() => setPage('documents')} />
        )}
        {page === 'document' && activeDoc && workspaceName && (
          <DocumentPage
            doc={activeDoc}
            workspaceName={workspaceName}
            workspacePath={workspacePath ?? ''}
            onBack={() => setPage('documents')}
            onDocumentsChange={loadDocuments}
            userName={userProfile.name ?? undefined}
          />
        )}
        {page === 'design-system-doc' && workspaceName && (
          <DesignSystemDocPage
            workspaceName={workspaceName}
            workspacePath={workspacePath}
            onBack={() => setPage('documents')}
          />
        )}
        {page === 'renderer-poc' && <RendererPocPage />}
        {page === 'settings' && <SettingsV2Page />}
      </div>
    </div>
  );
}

export { App };
