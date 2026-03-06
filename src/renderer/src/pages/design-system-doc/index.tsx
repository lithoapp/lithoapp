import * as Sentry from '@sentry/electron/renderer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DesignSystemChat } from '@/components/chat/design-system-chat';
import { Spinner } from '@/components/ui/spinner';
import { type PostTurnValidator, usePostTurnDiagnostics } from '@/hooks/use-post-turn-diagnostics';
import type { DocumentConfig, DocumentInfo } from '../../../../shared/types';
import { DocumentPage } from '../document';

const REBUILD_ALL_ON_TOOLS = ['writeMainCss', 'editMainCss'];

interface DesignSystemDocPageProps {
  workspaceName: string;
  workspaceTitle?: string;
  workspacePath: string | null;
  onBack: () => void;
  onAgentBusyChange?: (busy: boolean) => void;
}

export function DesignSystemDocPage({
  workspaceName,
  workspaceTitle,
  workspacePath,
  onBack,
  onAgentBusyChange,
}: DesignSystemDocPageProps): React.JSX.Element {
  const [dsDocId, setDsDocId] = useState<string | null>(null);
  const [docConfig, setDocConfig] = useState<DocumentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAgentBusy, setIsAgentBusy] = useState(false);

  // This ref is populated by DocumentPage → Chat via the renderChat prop.
  // We pass it to the diagnostics hook so it can inject messages.
  const sendMessageRef = useRef<((text: string) => void) | null>(null);

  const cssValidator: PostTurnValidator = useMemo(
    () => ({
      tools: ['writeMainCss', 'editMainCss'],
      severity: 'error',
      getDirtyKey: () => 'css',
      validate: async () => {
        const result = await window.litho.renderer.validateCss(workspaceName);
        return result.ok ? [] : result.errors;
      },
      formatMessage: (errors) =>
        `CSS validation found ${errors.length} error(s) in styles.css:\n${errors.map((e) => `- ${e}`).join('\n')}\n\nFix these errors.`,
    }),
    [workspaceName],
  );

  const diagnosticToolComplete = usePostTurnDiagnostics(
    [cssValidator],
    sendMessageRef,
    isAgentBusy,
  );

  // On the first busy→idle transition (kickoff reply), force-dirty the CSS
  // validator so we validate existing styles even if no CSS tools were called.
  const hasCompletedFirstTurnRef = useRef(false);
  const wasBusyRef = useRef(false);

  const handleBusyChange = useCallback(
    (busy: boolean) => {
      const wasBusy = wasBusyRef.current;
      wasBusyRef.current = busy;

      if (wasBusy && !busy && !hasCompletedFirstTurnRef.current) {
        hasCompletedFirstTurnRef.current = true;
        diagnosticToolComplete('writeMainCss', {});
      }

      setIsAgentBusy(busy);
      onAgentBusyChange?.(busy);
    },
    [diagnosticToolComplete, onAgentBusyChange],
  );

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const id = await window.litho.workspace.getDesignSystemDocId(workspaceName);
        setDsDocId(id);
        if (id) {
          const config = await window.litho.document.read(workspaceName, id);
          setDocConfig(config);
        }
      } catch (err) {
        console.error('[ds-doc] Failed to load design system doc:', err);
        Sentry.captureException(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceName]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!dsDocId || !docConfig || !workspacePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">No design system document found</p>
      </div>
    );
  }

  const doc: DocumentInfo = {
    id: dsDocId,
    title: docConfig.title,
    type: 'design-system',
    size: docConfig.size,
    pages: docConfig.pages,
  };

  return (
    <DocumentPage
      doc={doc}
      workspaceName={workspaceName}
      workspaceTitle={workspaceTitle}
      workspacePath={workspacePath}
      onBack={onBack}
      rebuildAllOnTools={REBUILD_ALL_ON_TOOLS}
      refetchDocOnPageChange
      renderChat={({
        workspaceName: wsName,
        workspaceTitle: wsTitle,
        workspacePath: wsPath,
        onToolComplete,
        sendMessageRef: parentSendRef,
        onBusyChange: parentBusyChange,
      }) => (
        <DesignSystemChat
          workspaceName={wsName}
          workspaceTitle={wsTitle}
          workspacePath={wsPath}
          onToolComplete={(tool, args) => {
            onToolComplete(tool, args);
            diagnosticToolComplete(tool, args);
          }}
          sendMessageRef={sendMessageRef}
          parentSendMessageRef={parentSendRef}
          onBusyChange={(busy) => {
            handleBusyChange(busy);
            parentBusyChange(busy);
          }}
        />
      )}
    />
  );
}
