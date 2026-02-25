import { Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Chat } from '@/components/chat/chat';
import { Button } from '@/components/ui/button';
import { useOpencode } from '@/hooks/use-opencode';
import { useSessionInit } from '@/hooks/use-session-init';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';

interface DesignSystemChatProps {
  workspacePath: string;
  onFileEdit?: (filePath: string) => void;
}

function buildStorageKey(workspacePath: string): string {
  return `litho-ds-session:${workspacePath}`;
}

export function DesignSystemChat({
  workspacePath,
  onFileEdit,
}: DesignSystemChatProps): React.JSX.Element {
  const { client, baseUrl, status } = useOpencode();
  const [resetKey, setResetKey] = useState(0);
  const [snapshotIndex, setSnapshotIndex] = useState<Record<string, string>>({});
  const [fontContext, setFontContext] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    window.litho.preferences
      .getUserProfile()
      .then((profile) => setUserName(profile.name ?? ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fontExts = new Set(['.woff2', '.woff', '.ttf', '.otf']);
    window.litho.assets
      .list(workspacePath, '', true)
      .then((entries) => {
        const fonts = entries.filter((e) => e.type === 'file' && fontExts.has(e.ext));
        if (fonts.length === 0) return;
        const fontPaths = fonts.map((f) => `@assets/${f.path}`).join('\n');
        setFontContext(`\n\nAvailable font files:\n${fontPaths}`);
      })
      .catch(() => {
        // keep empty
      });
  }, [workspacePath]);

  const workspaceName = workspacePath.split('/').at(-1) ?? workspacePath;

  const { sessionId, creating, createError } = useSessionInit({
    client,
    storageKey: buildStorageKey(workspacePath),
    sessionTitle: `Design System — ${workspaceName}`,
    resetKey,
  });

  const handleNewChat = () => {
    localStorage.removeItem(buildStorageKey(workspacePath));
    setSnapshotIndex({});
    setResetKey((k) => k + 1);
  };

  const captureFiles = useCallback(async () => {
    return window.litho.snapshot.readStylesFile(workspacePath);
  }, [workspacePath]);

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
        const snapshotId = await window.litho.snapshot.createStyles(
          workspacePath,
          files,
          promptExcerpt,
          assistantMessageId,
        );
        setSnapshotIndex((prev) => ({ ...prev, [assistantMessageId]: snapshotId }));
      } catch {
        // snapshot failure is non-fatal
      }
    },
    [workspacePath],
  );

  const handleRevert = useCallback(
    async (assistantMessageId: string) => {
      const snapshotId = snapshotIndex[assistantMessageId];
      if (!snapshotId) return;
      try {
        await window.litho.snapshot.restoreStyles(workspacePath, snapshotId);
      } catch (err) {
        console.error('[design-system-chat] Revert failed:', err);
        toast.error('Failed to revert styles');
      }
    },
    [snapshotIndex, workspacePath],
  );

  const { system, kickoff } = promptTemplates['design-system'];

  const systemPrompt = useMemo(
    () => renderTemplate(system, { workspacePath, fontContext }),
    [workspacePath, fontContext, system],
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
      agentName="design-system"
      sessionId={sessionId}
      client={client}
      baseUrl={baseUrl}
      onFileEdit={onFileEdit}
      onNewChat={handleNewChat}
      kickoffMessage={kickoffMessage}
      snapshotIndex={snapshotIndex}
      onRevert={handleRevert}
      captureFiles={captureFiles}
      onTurnSnapshot={handleTurnSnapshot}
    />
  );
}
