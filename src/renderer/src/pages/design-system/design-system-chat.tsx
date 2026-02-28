import { Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chat } from '@/components/chat/chat';
import { Button } from '@/components/ui/button';
import { useOpencode } from '@/hooks/use-opencode';
import { useSessionInit } from '@/hooks/use-session-init';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';
import type { DocumentConfig } from '../../../../shared/types';

type SendMessageFn = ((text: string) => void) | null;

interface DesignSystemChatProps {
  workspaceName: string;
  workspacePath: string;
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
  sendMessageRef?: React.RefObject<SendMessageFn>;
  parentSendMessageRef?: React.RefObject<SendMessageFn>;
  onBusyChange?: (isBusy: boolean) => void;
}

function buildStorageKey(workspaceName: string): string {
  return `litho-ds-session:${workspaceName}`;
}

export function DesignSystemChat({
  workspaceName,
  workspacePath,
  onToolComplete,
  sendMessageRef,
  parentSendMessageRef,
  onBusyChange,
}: DesignSystemChatProps): React.JSX.Element {
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
  const { client, baseUrl, status } = useOpencode();
  const [resetKey, setResetKey] = useState(0);
  const [fontContext, setFontContext] = useState('');
  const [userName, setUserName] = useState('');
  const [dsDocId, setDsDocId] = useState<string | null>(null);
  const [docConfig, setDocConfig] = useState<DocumentConfig | null>(null);

  useEffect(() => {
    window.litho.preferences
      .getUserProfile()
      .then((profile) => setUserName(profile.name ?? ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const id = await window.litho.workspace.getDesignSystemDocId(workspaceName);
        setDsDocId(id);
        if (id) {
          const config = await window.litho.document.read(workspaceName, id);
          setDocConfig(config);
        }
      } catch {
        // non-fatal
      }
    })();
  }, [workspaceName]);

  useEffect(() => {
    const fontExts = new Set(['.woff2', '.woff', '.ttf', '.otf']);
    window.litho.assets
      .list(workspaceName, '', true)
      .then((entries) => {
        const fonts = entries.filter((e) => e.type === 'file' && fontExts.has(e.ext));
        if (fonts.length === 0) return;
        const fontPaths = fonts.map((f) => `@assets/${f.path}`).join('\n');
        setFontContext(`\n\nAvailable font files:\n${fontPaths}`);
      })
      .catch(() => {
        // keep empty
      });
  }, [workspaceName]);

  const { sessionId, creating, createError } = useSessionInit({
    client,
    storageKey: buildStorageKey(workspaceName),
    sessionTitle: `Design System — ${workspaceName}`,
    resetKey,
  });

  const handleNewChat = () => {
    localStorage.removeItem(buildStorageKey(workspaceName));
    setResetKey((k) => k + 1);
  };

  const refetchDocConfig = useCallback(async () => {
    if (!dsDocId) return;
    try {
      const config = await window.litho.document.read(workspaceName, dsDocId);
      setDocConfig(config);
    } catch {
      // non-fatal
    }
  }, [workspaceName, dsDocId]);

  const handleToolComplete = useCallback(
    (tool: string, args: Record<string, unknown>) => {
      if (tool === 'createPage' || tool === 'deletePage') {
        void refetchDocConfig();
      }
      onToolComplete?.(tool, args);
    },
    [onToolComplete, refetchDocConfig],
  );

  const { system, kickoff } = promptTemplates['design-system'];

  const systemPrompt = useMemo(
    () => renderTemplate(system, { fontContext, docId: dsDocId }),
    [fontContext, system, dsDocId],
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
      onToolComplete={handleToolComplete}
      onNewChat={handleNewChat}
      kickoffMessage={kickoffMessage}
      sendMessageRef={mergedSendRef}
      onBusyChange={onBusyChange}
      pages={docConfig?.pages}
    />
  );
}
