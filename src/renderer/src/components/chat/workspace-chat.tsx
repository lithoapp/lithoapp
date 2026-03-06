import { useEffect, useMemo, useState } from 'react';
import { promptTemplates, renderTemplate } from '@/lib/prompt-templates';
import { Chat } from './chat';

/**
 * Well-known document ID used to persist the workspace-level conversation.
 * This is not a real document — it's a synthetic key for the conversations table.
 */
const WORKSPACE_CONVERSATION_ID = '__workspace__';

interface WorkspaceChatProps {
  workspaceName: string;
  workspaceTitle: string;
  onToolComplete?: (tool: string, args: Record<string, unknown>) => void;
}

export function WorkspaceChat({
  workspaceName,
  workspaceTitle,
  onToolComplete,
}: WorkspaceChatProps): React.JSX.Element {
  const [userName, setUserName] = useState('');

  useEffect(() => {
    window.litho.preferences
      .getUserProfile()
      .then((profile) => setUserName(profile.name ?? ''))
      .catch(() => {});
  }, []);

  const agentContext = useMemo(
    () => ({
      workspaceTitle,
      userName: userName || undefined,
    }),
    [workspaceTitle, userName],
  );

  const { kickoff } = promptTemplates.workspace;
  const kickoffMessage = useMemo(() => renderTemplate(kickoff, { userName }), [userName, kickoff]);

  return (
    <Chat
      workspaceName={workspaceName}
      documentId={WORKSPACE_CONVERSATION_ID}
      agentId="workspace"
      agentContext={agentContext}
      kickoffMessage={kickoffMessage}
      onToolComplete={onToolComplete}
    />
  );
}
