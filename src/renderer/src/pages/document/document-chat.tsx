import { Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Chat } from '@/components/chat/chat';
import { Button } from '@/components/ui/button';
import { useOpencode } from '@/hooks/use-opencode';
import { useSessionInit } from '@/hooks/use-session-init';
import type { ManifestDocument } from '@/hooks/use-workspace-manifest';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';

interface DocumentChatProps {
  doc: ManifestDocument;
  workspacePath: string;
  userName?: string;
}

function buildStorageKey(workspacePath: string, slug: string): string {
  return `litho-doc-session:${workspacePath}:${slug}`;
}

export function DocumentChat({
  doc,
  workspacePath,
  userName,
}: DocumentChatProps): React.JSX.Element {
  const { client, baseUrl, status } = useOpencode();
  const [resetKey, setResetKey] = useState(0);
  const [snapshotIndex, setSnapshotIndex] = useState<Record<string, string>>({});
  const [assetsSummary, setAssetsSummary] = useState(
    'Assets: @assets/... (workspace-level assets)',
  );

  useEffect(() => {
    void (async () => {
      try {
        const entries = await window.litho.assets.list(workspacePath, '', false);
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
  }, [workspacePath]);

  const { sessionId, creating, createError } = useSessionInit({
    client,
    storageKey: buildStorageKey(workspacePath, doc.slug),
    sessionTitle: `Document — ${doc.slug}`,
    resetKey,
  });

  const handleNewChat = () => {
    localStorage.removeItem(buildStorageKey(workspacePath, doc.slug));
    setSnapshotIndex({});
    setResetKey((k) => k + 1);
  };

  const captureFiles = useCallback(async () => {
    return window.litho.snapshot.readDocumentFiles(workspacePath, doc.slug);
  }, [workspacePath, doc.slug]);

  const handleTurnSnapshot = useCallback(
    async ({
      files,
      assistantMessageId,
      promptExcerpt,
    }: {
      files: Record<string, string>;
      assistantMessageId: string;
      promptExcerpt: string;
    }) => {
      try {
        const snapshotId = await window.litho.snapshot.createDocument(
          workspacePath,
          doc.slug,
          files,
          promptExcerpt,
          assistantMessageId,
        );
        setSnapshotIndex((prev) => ({ ...prev, [assistantMessageId]: snapshotId }));
      } catch {
        // snapshot failure is non-fatal
      }
    },
    [workspacePath, doc.slug],
  );

  const handleRevert = useCallback(
    async (assistantMessageId: string) => {
      const snapshotId = snapshotIndex[assistantMessageId];
      if (!snapshotId) return;
      try {
        await window.litho.snapshot.restoreDocument(workspacePath, doc.slug, snapshotId);
      } catch (err) {
        console.error('[document-chat] Revert failed:', err);
        toast.error('Failed to revert document');
      }
    },
    [snapshotIndex, workspacePath, doc.slug],
  );

  const { system, kickoff } = promptTemplates.document;

  const systemPrompt = useMemo(
    () =>
      renderTemplate(system, {
        workspacePath,
        slug: doc.slug,
        title: doc.title,
        width: doc.size.width,
        height: doc.size.height,
        unit: doc.size.unit,
        pageList: doc.pages.join(', '),
        assetsSummary,
      }),
    [workspacePath, doc.slug, doc.title, doc.size, doc.pages, assetsSummary, system],
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
      docSlug={doc.slug}
      sessionId={sessionId}
      client={client}
      baseUrl={baseUrl}
      onNewChat={handleNewChat}
      kickoffMessage={kickoffMessage}
      snapshotIndex={snapshotIndex}
      onRevert={handleRevert}
      captureFiles={captureFiles}
      onTurnSnapshot={handleTurnSnapshot}
    />
  );
}
