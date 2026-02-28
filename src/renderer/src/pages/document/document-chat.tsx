import { Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Chat } from '@/components/chat/chat';
import { Button } from '@/components/ui/button';
import { useOpencode } from '@/hooks/use-opencode';
import { useSessionInit } from '@/hooks/use-session-init';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';
import type { DocumentInfo } from '../../../../shared/types';

interface DocumentChatProps {
  doc: DocumentInfo;
  workspaceName: string;
  workspacePath: string;
  userName?: string;
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
  sendMessageRef?: React.RefObject<((text: string) => void) | null>;
  onBusyChange?: (isBusy: boolean) => void;
}

function buildStorageKey(workspaceName: string, slug: string): string {
  return `litho-doc-session:${workspaceName}:${slug}`;
}

export function DocumentChat({
  doc,
  workspaceName,
  workspacePath,
  userName,
  onToolComplete,
  sendMessageRef,
  onBusyChange,
}: DocumentChatProps): React.JSX.Element {
  const { client, baseUrl, status } = useOpencode();
  const [resetKey, setResetKey] = useState(0);
  const [assetsSummary, setAssetsSummary] = useState(
    'Assets: @assets/... (workspace-level assets)',
  );
  const [designSystemDocId, setDesignSystemDocId] = useState<string | null>(null);

  useEffect(() => {
    window.litho.workspace
      .getDesignSystemDocId(workspaceName)
      .then((id) => setDesignSystemDocId(id))
      .catch(() => {});
  }, [workspaceName]);

  useEffect(() => {
    void (async () => {
      try {
        const entries = await window.litho.assets.list(workspaceName, '', false);
        const dirs = entries.filter((e) => e.type === 'directory').map((e) => e.name);
        const fileCount = entries.filter((e) => e.type === 'file').length;
        const dirList = dirs.length > 0 ? `\nTop-level directories: ${dirs.join(', ')}` : '';
        setAssetsSummary(
          `Assets: ${entries.length} item(s) (${fileCount} file(s))${dirList}\n` +
            `Usage: reference as @assets/path/to/file.ext\n` +
            `The agent can explore the assets directory to find specific files.`,
        );
      } catch {
        // silent — summary has a safe default
      }
    })();
  }, [workspaceName]);

  const { sessionId, creating, createError } = useSessionInit({
    client,
    storageKey: buildStorageKey(workspaceName, doc.id),
    sessionTitle: `Document — ${doc.id}`,
    resetKey,
  });

  const handleNewChat = () => {
    localStorage.removeItem(buildStorageKey(workspaceName, doc.id));
    setResetKey((k) => k + 1);
  };

  const { system, kickoff } = promptTemplates.document;

  const systemPrompt = useMemo(
    () =>
      renderTemplate(system, {
        docId: doc.id,
        title: doc.title,
        width: doc.size.width,
        height: doc.size.height,
        unit: doc.size.unit,
        assetsSummary,
        designSystemDocId,
      }),
    [doc.id, doc.title, doc.size, assetsSummary, designSystemDocId, system],
  );

  const kickoffMessage = useMemo(() => renderTemplate(kickoff, { userName }), [userName, kickoff]);

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-base text-destructive">
          The AI server failed to start after multiple attempts.
        </p>
        <Button
          variant="outline"
          className="h-10 px-4 text-sm"
          onClick={() => window.litho.opencode.restart()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!client || !baseUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <MessageSquare className="size-8" />
        <p className="text-base">Waiting for AI server...</p>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin" />
        <p className="text-base">Starting session...</p>
      </div>
    );
  }

  if (createError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-destructive">
        <p className="text-base">{createError}</p>
        <Button
          variant="outline"
          className="h-10 px-4 text-sm"
          onClick={() => setResetKey((k) => k + 1)}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!sessionId) return <div />;

  return (
    <Chat
      directory={workspacePath}
      systemPrompt={systemPrompt}
      agentName="document"
      sessionId={sessionId}
      client={client}
      baseUrl={baseUrl}
      onToolComplete={onToolComplete}
      onNewChat={handleNewChat}
      kickoffMessage={kickoffMessage}
      sendMessageRef={sendMessageRef}
      onBusyChange={onBusyChange}
      pages={doc.pages}
    />
  );
}
