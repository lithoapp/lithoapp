import { useCallback, useEffect, useMemo, useState } from 'react';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';
import type { DocumentConfig } from '../../../../shared/types';
import { Chat } from './chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SendMessageFn = ((text: string) => void) | null;

interface DesignSystemChatProps {
  workspaceName: string;
  workspacePath: string;
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
  sendMessageRef?: React.RefObject<SendMessageFn>;
  parentSendMessageRef?: React.RefObject<SendMessageFn>;
  onBusyChange?: (isBusy: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DesignSystemChat({
  workspaceName,
  onToolComplete,
  sendMessageRef,
  parentSendMessageRef,
  onBusyChange,
}: DesignSystemChatProps): React.JSX.Element {
  // Merged ref so both parent (CSS diagnostics) and child (TSX diagnostics) can inject messages
  const mergedSendRef = useMemo(() => {
    let value: SendMessageFn = null;
    return {
      get current() {
        return value;
      },
      set current(fn: SendMessageFn) {
        value = fn;
        if (sendMessageRef) sendMessageRef.current = fn;
        if (parentSendMessageRef) parentSendMessageRef.current = fn;
      },
    } satisfies React.RefObject<SendMessageFn>;
  }, [sendMessageRef, parentSendMessageRef]);

  const [userName, setUserName] = useState('');
  const [dsDocId, setDsDocId] = useState<string | null>(null);
  const [docConfig, setDocConfig] = useState<DocumentConfig | null>(null);

  // User name
  useEffect(() => {
    window.litho.preferences
      .getUserProfile()
      .then((profile) => setUserName(profile.name ?? ''))
      .catch(() => {});
  }, []);

  // Design system doc ID + config
  useEffect(() => {
    void (async () => {
      try {
        const id = await window.litho.workspace.getDesignSystemDocId(workspaceName);
        setDsDocId(id);
        if (id) {
          const config = (await window.litho.document.read(workspaceName, id)) as DocumentConfig;
          setDocConfig(config);
        }
      } catch {
        // non-fatal
      }
    })();
  }, [workspaceName]);

  // Refetch doc config when pages change
  const refetchDocConfig = useCallback(async () => {
    if (!dsDocId) return;
    try {
      const config = (await window.litho.document.read(workspaceName, dsDocId)) as DocumentConfig;
      setDocConfig(config);
    } catch {
      // non-fatal
    }
  }, [workspaceName, dsDocId]);

  // Wrap onToolComplete to refetch doc config on page changes
  const handleToolComplete = useCallback(
    (tool: string, args: Record<string, unknown>) => {
      if (tool === 'createPage' || tool === 'deletePage') {
        void refetchDocConfig();
      }
      onToolComplete?.(tool, args);
    },
    [onToolComplete, refetchDocConfig],
  );

  // Build agent context
  const agentContext = useMemo(
    () => ({
      docId: dsDocId ?? '',
      userName: userName || undefined,
    }),
    [dsDocId, userName],
  );

  // Kickoff message
  const { kickoff } = promptTemplates['design-system'];
  const kickoffMessage = useMemo(() => renderTemplate(kickoff, { userName }), [userName, kickoff]);

  // Wait for design system doc to resolve
  if (!dsDocId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading design system...
      </div>
    );
  }

  return (
    <Chat
      workspaceName={workspaceName}
      documentId={dsDocId}
      agentId="design-system"
      agentContext={agentContext}
      kickoffMessage={kickoffMessage}
      onToolComplete={handleToolComplete}
      sendMessageRef={mergedSendRef}
      onBusyChange={onBusyChange}
      pages={docConfig?.pages}
    />
  );
}
