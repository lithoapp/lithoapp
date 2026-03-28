export const CHAT_PREFS_KEY = 'litho-chat-prefs';

export interface ChatPrefs {
  providerId: string;
  modelId: string;
}

export function loadChatPrefs(): ChatPrefs {
  try {
    const raw = localStorage.getItem(CHAT_PREFS_KEY);
    if (raw) return JSON.parse(raw) as ChatPrefs;
  } catch {}
  return { providerId: '', modelId: '' };
}

export function saveChatPrefs(prefs: ChatPrefs): void {
  localStorage.setItem(CHAT_PREFS_KEY, JSON.stringify(prefs));
}

export async function maybeAutoSelectDefault(providerId: string): Promise<string | null> {
  if (loadChatPrefs().providerId !== '') return null;
  try {
    const models = await window.litho.aiProvider.models(providerId);
    const first = models[0];
    if (!first) return null;
    saveChatPrefs({ providerId, modelId: first.id });
    return first.name;
  } catch {
    return null;
  }
}
