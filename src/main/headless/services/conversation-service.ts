import type { StoredMessage } from '../../../shared/types';
import { saveConversation } from '../../workspace-data';
import { assertWorkspaceNameSafe } from '../../workspace-paths';

export interface SaveConversationParams {
  workspaceId: string;
  documentId: string;
  messages: StoredMessage[];
  usage: { inputTokens: number; outputTokens: number };
}

export async function handleConversationSave(
  params: SaveConversationParams,
): Promise<Record<string, never>> {
  assertWorkspaceNameSafe(params.workspaceId);
  await saveConversation(
    params.workspaceId,
    params.documentId,
    params.messages,
    params.usage,
  );
  return {};
}
