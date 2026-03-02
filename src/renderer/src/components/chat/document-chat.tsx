import { useEffect, useMemo, useState } from 'react';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';
import type { DocumentInfo } from '../../../../shared/types';
import { Chat } from './chat';

// ---------------------------------------------------------------------------
// Props — same interface as the old document-chat
// ---------------------------------------------------------------------------

interface DocumentChatProps {
  doc: DocumentInfo;
  workspaceName: string;
  workspacePath: string;
  userName?: string;
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
  sendMessageRef?: React.RefObject<((text: string) => void) | null>;
  onBusyChange?: (isBusy: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentChat({
  doc,
  workspaceName,
  userName,
  onToolComplete,
  sendMessageRef,
  onBusyChange,
}: DocumentChatProps): React.JSX.Element {
  const [assetsSummary, setAssetsSummary] = useState(
    'Assets: @assets/... (workspace-level assets)',
  );
  const [designSystemDocId, setDesignSystemDocId] = useState<string | null>(null);

  // Resolve design system doc ID
  useEffect(() => {
    window.litho.workspace
      .getDesignSystemDocId(workspaceName)
      .then((id) => setDesignSystemDocId(id))
      .catch(() => {});
  }, [workspaceName]);

  // Resolve assets summary
  useEffect(() => {
    void (async () => {
      try {
        const entries = (await window.litho.assets.list(workspaceName, '', false)) as Array<{
          type: string;
          name: string;
        }>;
        const dirs = entries.filter((e) => e.type === 'directory').map((e) => e.name);
        const fileCount = entries.filter((e) => e.type === 'file').length;
        const dirList = dirs.length > 0 ? `\nTop-level directories: ${dirs.join(', ')}` : '';
        setAssetsSummary(
          `Assets: ${entries.length} item(s) (${fileCount} file(s))${dirList}\n` +
            'Usage: reference as @assets/path/to/file.ext\n' +
            'The agent can explore the assets directory to find specific files.',
        );
      } catch {
        // keep default
      }
    })();
  }, [workspaceName]);

  // Build agent context
  const agentContext = useMemo(
    () => ({
      docId: doc.id,
      title: doc.title,
      width: doc.size.width,
      height: doc.size.height,
      unit: doc.size.unit,
      userName,
      assetsSummary,
      designSystemDocId,
    }),
    [doc.id, doc.title, doc.size, userName, assetsSummary, designSystemDocId],
  );

  // Kickoff message
  const { kickoff } = promptTemplates.document;
  const kickoffMessage = useMemo(() => renderTemplate(kickoff, { userName }), [userName, kickoff]);

  return (
    <Chat
      workspaceName={workspaceName}
      documentId={doc.id}
      agentId="document"
      agentContext={agentContext}
      kickoffMessage={kickoffMessage}
      onToolComplete={onToolComplete}
      sendMessageRef={sendMessageRef}
      onBusyChange={onBusyChange}
      pages={doc.pages}
    />
  );
}
