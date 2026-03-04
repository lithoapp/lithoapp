import { Files, Home, Images, Loader2, Palette, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { useDesignSystem } from '@/hooks/use-design-system';
import { useWorkspace } from '@/hooks/use-workspace';
import { cn } from '@/lib/utils';
import type { DocumentInfo } from '../../shared/types';
import { AssetsPage } from './pages/assets';
import { DesignSystemDocPage } from './pages/design-system-doc';
import { DocumentPage } from './pages/document';
import { DocumentsPage } from './pages/documents';
import { OnboardingPage } from './pages/onboarding';
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
  | 'workspace-loading'
  | 'workspace-closing';

/** Parse a hex color (#rgb or #rrggbb) to [r, g, b] in 0–255. */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      Number.parseInt(h[0] + h[0], 16),
      Number.parseInt(h[1] + h[1], 16),
      Number.parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/** Relative luminance (WCAG). Returns 0 (black) to 1 (white). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function App(): React.JSX.Element {
  const [platform, setPlatform] = useState<string>('');
  const [page, setPage] = useState<Page>('workspaces');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    name: string | null;
    email: string | null;
  } | null>(null);

  const { info: workspaceInfo, workspaces, refreshWorkspaces } = useWorkspace();
  const workspaceName = workspaceInfo.workspaceName;
  const workspacePath = workspaceInfo.workspacePath;
  const workspaceTitle = workspaces.find((ws) => ws.slug === workspaceName)?.title;

  const { designSystem } = useDesignSystem(workspaceName);

  const titleBarTheme = useMemo(() => {
    const primaryPalette = designSystem?.colors.palettes.find(
      (p) => p.name.toLowerCase() === 'primary',
    );
    const shade =
      primaryPalette?.shades.find((s) => s.variable.endsWith('-600')) ??
      primaryPalette?.shades.find((s) => s.variable.endsWith('-500'));
    if (!shade?.value.startsWith('#')) return null;
    const isLight = relativeLuminance(shade.value) > 0.4;
    return { bg: shade.value, fg: isLight ? '#000000' : '#ffffff' };
  }, [designSystem]);

  useEffect(() => {
    void window.litho.app.setTitleBarOverlay(titleBarTheme?.bg ?? '', titleBarTheme?.fg ?? '');
  }, [titleBarTheme]);

  const [designSystemDoc, setDesignSystemDoc] = useState<DocumentInfo | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!workspaceName) {
      setDocuments([]);
      setDesignSystemDoc(null);
      return;
    }
    setDocumentsLoading(true);
    try {
      const [docs, dsDoc] = await Promise.all([
        window.litho.document.list(workspaceName),
        window.litho.workspace.getDesignSystemDocInfo(workspaceName),
      ]);
      setDocuments(docs);
      setDesignSystemDoc(dsDoc);
    } catch (err) {
      console.error('[app] Failed to load documents:', err);
      toast.error('Failed to load documents');
    } finally {
      setDocumentsLoading(false);
    }
  }, [workspaceName]);

  // Load documents when workspace becomes active
  useEffect(() => {
    if (workspaceInfo.status === 'active') {
      loadDocuments();
    } else {
      setDocuments([]);
      setDesignSystemDoc(null);
    }
  }, [workspaceInfo.status, loadDocuments]);

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

  useEffect(() => {
    void window.litho.app.getPlatform().then(setPlatform);
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
    const onWorkspacePage = ['documents', 'document', 'design-system-doc', 'assets'].includes(page);
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

  const activeDoc = activeDocId ? (documents.find((d) => d.id === activeDocId) ?? null) : null;

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
          className={cn(
            'flex h-10 w-full shrink-0 items-center justify-end',
            platform === 'win32' ? 'pr-[140px]' : 'pr-4',
          )}
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
        className={cn(
          'flex h-10 shrink-0 items-center transition-colors duration-300',
          platform === 'win32' ? 'pl-4 pr-[140px]' : 'pl-[80px] pr-4',
          !titleBarTheme && 'border-b border-border',
        )}
        style={
          {
            WebkitAppRegion: 'drag',
            ...(titleBarTheme && { backgroundColor: titleBarTheme.bg, color: titleBarTheme.fg }),
          } as React.CSSProperties
        }
      >
        <span className="text-sm font-semibold">
          {workspaceInfo.status === 'active' && workspaceTitle ? workspaceTitle : 'Home'}
        </span>

        <nav
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {workspaceInfo.status === 'active'
            ? (
                [
                  {
                    p: ['documents', 'document'] satisfies Page[],
                    icon: Files,
                    target: 'documents' as Page,
                  },
                  {
                    p: ['design-system-doc'] satisfies Page[],
                    icon: Palette,
                    target: 'design-system-doc' as Page,
                  },
                  { p: ['assets'] satisfies Page[], icon: Images, target: 'assets' as Page },
                  { p: ['settings'] satisfies Page[], icon: Settings2, target: 'settings' as Page },
                ] as { p: Page[]; icon: typeof Files; target: Page }[]
              ).map(({ p, icon: Icon, target }) => {
                const isActive = p.includes(page);
                return (
                  <Button
                    key={target}
                    variant={!titleBarTheme && isActive ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    className={titleBarTheme && isActive ? 'bg-white/20' : undefined}
                    onClick={() => setPage(target)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                );
              })
            : (
                [
                  { p: ['workspaces'] satisfies Page[], icon: Home, target: 'workspaces' as Page },
                  { p: ['settings'] satisfies Page[], icon: Settings2, target: 'settings' as Page },
                ] as { p: Page[]; icon: typeof Home; target: Page }[]
              ).map(({ p, icon: Icon, target }) => {
                const isActive = p.includes(page);
                return (
                  <Button
                    key={target}
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="icon-sm"
                    onClick={() => setPage(target)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                );
              })}
          <div className={cn('mx-1 h-4 w-px', titleBarTheme ? 'bg-white/20' : 'bg-border')} />
          <ThemeSwitcher />
        </nav>
      </div>

      {/* Main content */}
      <div
        className={`flex-1 ${page === 'document' || page === 'design-system-doc' || page === 'workspace-loading' || page === 'workspace-closing' || page === 'settings' || page === 'assets' ? 'overflow-hidden' : 'overflow-auto p-6'}`}
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
            workspaceTitle={workspaceTitle ?? workspaceName}
            documents={documents}
            designSystemDoc={designSystemDoc}
            isLoading={documentsLoading}
            refetch={loadDocuments}
            onSelectDocument={(docId) => {
              setActiveDocId(docId);
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
        {page === 'settings' && (
          <SettingsV2Page
            onBack={() => setPage(workspaceInfo.status === 'active' ? 'documents' : 'workspaces')}
          />
        )}
      </div>
    </div>
  );
}

export { App };
