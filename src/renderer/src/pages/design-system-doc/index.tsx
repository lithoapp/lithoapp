import * as Sentry from '@sentry/electron/renderer';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import type { DocumentConfig, DocumentInfo } from '../../../../shared/types';
import { DesignSystemChat } from '../design-system/design-system-chat';
import { DocumentPage } from '../document';

const REBUILD_ALL_ON_TOOLS = ['writeMainCss', 'editMainCss'];

interface DesignSystemDocPageProps {
  workspaceName: string;
  workspacePath: string | null;
  onBack: () => void;
}

export function DesignSystemDocPage({
  workspaceName,
  workspacePath,
  onBack,
}: DesignSystemDocPageProps): React.JSX.Element {
  const [dsDocId, setDsDocId] = useState<string | null>(null);
  const [docConfig, setDocConfig] = useState<DocumentConfig | null>(null);
  const [loading, setLoading] = useState(true);

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
      workspacePath={workspacePath}
      onBack={onBack}
      rebuildAllOnTools={REBUILD_ALL_ON_TOOLS}
      refetchDocOnPageChange
      renderChat={({ workspaceName: wsName, workspacePath: wsPath, onToolComplete }) => (
        <DesignSystemChat
          workspaceName={wsName}
          workspacePath={wsPath}
          onToolComplete={onToolComplete}
        />
      )}
    />
  );
}
