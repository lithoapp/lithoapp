import { useEffect, useMemo, useState } from 'react';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';
import type { DocumentInfo } from '../../../../shared/types';
import { Chat } from './chat';
import type { ChatDocumentLabelContext } from './message-tool-labels';

// ---------------------------------------------------------------------------
// Props — same interface as the old document-chat
// ---------------------------------------------------------------------------

interface DocumentChatProps {
  doc: DocumentInfo;
  workspaceName: string;
  workspaceTitle?: string;
  userName?: string;
  documents?: ChatDocumentLabelContext[];
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
  sendMessageRef?: React.RefObject<((text: string) => void) | null>;
  onBusyChange?: (isBusy: boolean) => void;
  onLeaveRequestChange?: (handler: (() => Promise<void>) | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentChat({
  doc,
  workspaceName,
  workspaceTitle,
  userName,
  documents,
  onToolComplete,
  sendMessageRef,
  onBusyChange,
  onLeaveRequestChange,
}: DocumentChatProps): React.JSX.Element {
  const [designSystemDocId, setDesignSystemDocId] = useState<string | null>(null);

  // Resolve design system doc ID
  useEffect(() => {
    window.litho.workspace
      .getDesignSystemDocId(workspaceName)
      .then((id) => setDesignSystemDocId(id))
      .catch(() => {});
  }, [workspaceName]);

  // Build agent context
  const agentContext = useMemo(
    () => ({
      docId: doc.id,
      title: doc.title,
      workspaceTitle,
      width: doc.size.width,
      height: doc.size.height,
      unit: doc.size.unit,
      userName,
      designSystemDocId,
    }),
    [doc.id, doc.title, workspaceTitle, doc.size, userName, designSystemDocId],
  );

  // Kickoff message
  const { kickoff } = promptTemplates.document;
  const kickoffMessage = useMemo(
    () => renderTemplate(kickoff, agentContext),
    [kickoff, agentContext],
  );

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
      onLeaveRequestChange={onLeaveRequestChange}
      documents={documents}
      pages={doc.pages}
    />
  );
}
