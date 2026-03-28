import { Files, Home, Images, Loader2, MessageSquareText, Palette, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ChatDocumentLabelContext } from '@/components/chat/message-tool-labels';
import { FeedbackDialog } from '@/components/feedback/feedback-dialog';
import { ThemeSwitcher } from '@/components/theme-switcher';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useDesignSystem } from '@/hooks/use-design-system';
import { useWorkspace } from '@/hooks/use-workspace';
import { NavigationContext } from '@/lib/navigation-context';
import { setRendererSentryTelemetryEnabled, syncRendererSentryUser } from '@/lib/sentry';
import { cn } from '@/lib/utils';
import type { DocumentInfo, FeedbackCategory } from '../../shared/types';
import { AssetsPage } from './pages/assets';
import { DesignSystemDocPage } from './pages/design-system-doc';
import { DocumentPage } from './pages/document';
import { DocumentsPage } from './pages/documents';
import { OnboardingPage } from './pages/onboarding';
import { type SettingsCategory, SettingsV2Page } from './pages/settings-v2';
import { WorkspaceTransitionPage } from './pages/workspace-transition';
import { WorkspacesPage } from './pages/workspaces';

type Page =
  | 'workspaces'
  | 'documents'
  | 'document'
  | 'design-system-doc'
  | 'assets'
  | 'settings'
  | 'workspace-opening'
  | 'workspace-leaving';

const LITHO_TITLEBAR_BG = '#e8652b';
const LITHO_TITLEBAR_FG = '#ffffff';

function App(): React.JSX.Element {
  const [platform, setPlatform] = useState<string>('');
  const [page, setPage] = useState<Page>('workspaces');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [pendingNav, setPendingNav] = useState<Page | null>(null);
  const [settingsInitialCategory, setSettingsInitialCategory] = useState<
    SettingsCategory | undefined
  >();
  const pendingNavCallbackRef = useRef<(() => void) | null>(null);
  const agentLeaveHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    name: string | null;
    email: string | null;
  } | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackInitialCategory, setFeedbackInitialCategory] =
    useState<FeedbackCategory>('general-feedback');

  const { workspaces, refreshWorkspaces } = useWorkspace();
  const workspaceTitle = workspaces.find((ws) => ws.slug === workspaceName)?.title;

  const { designSystem, refetch: refetchDesignSystem } = useDesignSystem(workspaceName);

  useEffect(() => {
    void window.litho.app.setTitleBarOverlay(LITHO_TITLEBAR_BG, LITHO_TITLEBAR_FG);
  }, []);

  const navigateTo = useCallback(
    (target: Page, callback?: () => void) => {
      const isOnAgentPage =
        page === 'documents' || page === 'document' || page === 'design-system-doc';
      if (isOnAgentPage && agentBusy) {
        setPendingNav(target);
        pendingNavCallbackRef.current = callback ?? null;
        return;
      }
      callback?.();
      setPage(target);
    },
    [page, agentBusy],
  );

  const registerAgentLeaveRequest = useCallback((handler: (() => Promise<void>) | null) => {
    agentLeaveHandlerRef.current = handler;
  }, []);

  async function confirmPendingNav(): Promise<void> {
    if (pendingNav) {
      try {
        await agentLeaveHandlerRef.current?.();
        pendingNavCallbackRef.current?.();
        pendingNavCallbackRef.current = null;
        setAgentBusy(false);
        setPage(pendingNav);
        setPendingNav(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to leave current page');
      }
    }
  }

  const navigationActions = useMemo(
    () => ({
      openSettings: (category?: SettingsCategory) => {
        setSettingsInitialCategory(category);
        navigateTo('settings');
      },
    }),
    [navigateTo],
  );

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

  useEffect(() => {
    if (workspaceName) {
      void loadDocuments();
    } else {
      setDocuments([]);
      setDesignSystemDoc(null);
    }
  }, [workspaceName, loadDocuments]);

  useEffect(() => {
    if (userProfile) {
      syncRendererSentryUser(userProfile);
    }
  }, [userProfile]);

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
      setRendererSentryTelemetryEnabled(telemetryEnabled);
      setOnboardingPhase('fading');
      await new Promise((resolve) => setTimeout(resolve, 300));
      setOnboardingPhase('transition');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setOnboardingPhase('done');
      setUserProfile({ name, email });
    },
    [],
  );

  const handleOpenWorkspace = useCallback((slug: string) => {
    setWorkspaceName(slug);
    setPage('workspace-opening');
  }, []);

  const handleCloseWorkspace = useCallback(() => {
    navigateTo('workspace-leaving');
  }, [navigateTo]);

  const openFeedback = useCallback((category: FeedbackCategory = 'general-feedback') => {
    setFeedbackInitialCategory(category);
    setFeedbackOpen(true);
  }, []);

  const activeDoc = activeDocId ? (documents.find((d) => d.id === activeDocId) ?? null) : null;
  const chatDocuments = useMemo<ChatDocumentLabelContext[]>(() => {
    const allDocuments = designSystemDoc ? [...documents, designSystemDoc] : documents;
    return allDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      pages: document.pages,
    }));
  }, [documents, designSystemDoc]);

  const inWorkspace = workspaceName !== null;

  const feedbackContext = useMemo(() => {
    const currentDocument =
      page === 'document' ? activeDoc : page === 'design-system-doc' ? designSystemDoc : null;

    const appArea =
      page === 'documents'
        ? 'Documents'
        : page === 'document'
          ? 'Document editor'
          : page === 'design-system-doc'
            ? 'Design system document'
            : page === 'assets'
              ? 'Assets'
              : page === 'settings'
                ? 'Settings'
                : page === 'workspace-opening'
                  ? 'Workspace opening'
                  : page === 'workspace-leaving'
                    ? 'Workspace closing'
                    : 'Workspaces';

    return {
      appArea,
      workspaceName,
      workspaceTitle,
      documentId: currentDocument?.id ?? null,
      documentTitle: currentDocument?.title ?? null,
    };
  }, [activeDoc, designSystemDoc, page, workspaceName, workspaceTitle]);

  if (userProfile === null) {
    return (
      <div className="h-10 w-full" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
    );
  }

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
      <div
        className={cn(
          'flex h-10 shrink-0 items-center transition-colors duration-300',
          platform === 'win32' ? 'pl-4 pr-[140px]' : 'pl-[80px] pr-4',
          'bg-forge text-white',
        )}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-semibold">
          {inWorkspace && workspaceTitle ? workspaceTitle : 'Home'}
        </span>

        <nav
          className="ml-auto flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {inWorkspace
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
                    variant="ghost"
                    size="icon-sm"
                    className={isActive ? 'bg-white/20 hover:bg-white/25' : 'hover:bg-white/10'}
                    onClick={() => navigateTo(target)}
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
                    variant="ghost"
                    size="icon-sm"
                    className={isActive ? 'bg-white/20 hover:bg-white/25' : 'hover:bg-white/10'}
                    onClick={() => navigateTo(target)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                );
              })}
          <div className="mx-1 h-4 w-px bg-white/20" />
          <ThemeSwitcher />
        </nav>
      </div>

      <NavigationContext.Provider value={navigationActions}>
        <div
          className={`flex-1 ${page === 'document' || page === 'design-system-doc' || page === 'documents' || page === 'workspace-opening' || page === 'workspace-leaving' || page === 'settings' || page === 'assets' ? 'overflow-hidden' : 'overflow-auto p-6'}`}
        >
          {page === 'workspaces' && (
            <WorkspacesPage
              workspaces={workspaces}
              onWorkspaceSelected={handleOpenWorkspace}
              refreshWorkspaces={refreshWorkspaces}
              userName={userProfile.name ?? undefined}
            />
          )}
          {page === 'workspace-opening' && workspaceName && (
            <WorkspaceTransitionPage
              mode="loading"
              workspaceName={workspaceTitle ?? workspaceName}
              onComplete={() => setPage('documents')}
            />
          )}
          {page === 'workspace-leaving' && (
            <WorkspaceTransitionPage
              mode="closing"
              onComplete={() => {
                setWorkspaceName(null);
                setPage('workspaces');
              }}
            />
          )}
          {page === 'documents' && workspaceName && (
            <DocumentsPage
              workspaceName={workspaceName}
              workspaceTitle={workspaceTitle ?? workspaceName}
              documents={documents}
              designSystemDoc={designSystemDoc}
              designSystem={designSystem}
              isLoading={documentsLoading}
              refetch={loadDocuments}
              onSelectDocument={(docId) => {
                setActiveDocId(docId);
                setPage('document');
              }}
              onOpenDesignSystem={() => setPage('design-system-doc')}
              onOpenAssets={() => setPage('assets')}
              onCloseWorkspace={handleCloseWorkspace}
              onAgentBusyChange={setAgentBusy}
              onAgentLeaveRequestChange={registerAgentLeaveRequest}
              chatDocuments={chatDocuments}
            />
          )}
          {page === 'assets' && workspaceName && (
            <AssetsPage workspaceName={workspaceName} onBack={() => navigateTo('documents')} />
          )}
          {page === 'document' && activeDoc && workspaceName && (
            <DocumentPage
              doc={activeDoc}
              workspaceName={workspaceName}
              workspaceTitle={workspaceTitle ?? workspaceName}
              onBack={() => navigateTo('documents')}
              onDocumentsChange={loadDocuments}
              userName={userProfile.name ?? undefined}
              onAgentBusyChange={setAgentBusy}
              onAgentLeaveRequestChange={registerAgentLeaveRequest}
              documents={chatDocuments}
            />
          )}
          {page === 'design-system-doc' && workspaceName && (
            <DesignSystemDocPage
              workspaceName={workspaceName}
              workspaceTitle={workspaceTitle ?? workspaceName}
              onBack={() => navigateTo('documents')}
              onAgentBusyChange={setAgentBusy}
              onAgentLeaveRequestChange={registerAgentLeaveRequest}
              onDesignSystemChange={() => void refetchDesignSystem()}
              documents={chatDocuments}
            />
          )}
          {page === 'settings' && (
            <SettingsV2Page
              initialCategory={settingsInitialCategory}
              onOpenFeedback={openFeedback}
              onBack={() => {
                setSettingsInitialCategory(undefined);
                setPage(workspaceName ? 'documents' : 'workspaces');
              }}
            />
          )}
        </div>
      </NavigationContext.Provider>

      <Button
        type="button"
        variant="outline"
        className="fixed bottom-5 left-5 z-40 h-10 rounded-full border-border/70 bg-background/90 px-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/75"
        onClick={() => openFeedback('general-feedback')}
      >
        <MessageSquareText className="h-4 w-4" />
        Feedback
      </Button>

      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        initialCategory={feedbackInitialCategory}
        defaultEmail={userProfile.email}
        appArea={feedbackContext.appArea}
        workspaceName={feedbackContext.workspaceName}
        workspaceTitle={feedbackContext.workspaceTitle}
        documentId={feedbackContext.documentId}
        documentTitle={feedbackContext.documentTitle}
      />

      <AlertDialog
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingNav(null);
            pendingNavCallbackRef.current = null;
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AI is still working</AlertDialogTitle>
            <AlertDialogDescription>
              The AI agent is processing your request. Leaving now may interrupt its work and
              produce incomplete results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Wait</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmPendingNav()}>
              Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { App };
