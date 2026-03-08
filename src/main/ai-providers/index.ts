import { abortChat, startChat } from './chat/run-chat';
import { ensureAiTables } from './db';
import { completeAnthropicOAuth, startAnthropicOAuth } from './oauth/anthropic';
import { completeOpenAIOAuth, startOpenAIOAuth } from './oauth/openai-flow';
import { getAuthMethods } from './providers/auth-methods';
import {
  getConnectedProviderIds,
  getCredential,
  removeCredential,
  setCredential,
} from './providers/credential-store';
import { filterModelsForProvider } from './providers/model-filters';
import {
  autoConnectProviders,
  fetchModels,
  getModelsCache,
  getModelsCacheError,
  getOAuthConfig,
  getProviderList,
  getProviderModels,
  initModelsCache,
  waitForModelsReady,
} from './providers/models-cache';
import { pingProvider } from './providers/ping';
import type { ChatStartParams } from './types';

// ---------------------------------------------------------------------------
// IPC handler registration
// ---------------------------------------------------------------------------

export function registerAiProviderHandlers(ipcMain: Electron.IpcMain): void {
  ensureAiTables();
  initModelsCache(() => autoConnectProviders(setCredential, getConnectedProviderIds));

  // --- Provider discovery ---

  ipcMain.handle('ai-provider:list', async () => {
    await waitForModelsReady();
    return {
      providers: getProviderList().map((p) => ({
        ...p,
        modelCount: filterModelsForProvider(p.id, getProviderModels(p.id)).length,
      })),
      connected: getConnectedProviderIds(),
      modelsDevLoaded: getModelsCache() !== null,
      modelsDevError: getModelsCacheError(),
    };
  });

  ipcMain.handle('ai-provider:models', (_event, providerId: string) =>
    filterModelsForProvider(providerId, getProviderModels(providerId)),
  );

  ipcMain.handle('ai-provider:auth-methods', (_event, providerId: string) =>
    getAuthMethods(providerId),
  );

  // --- Credential management ---

  ipcMain.handle('ai-provider:connect-api-key', (_event, providerId: string, key: string) => {
    setCredential(providerId, { type: 'api', key });
  });

  ipcMain.handle('ai-provider:disconnect', (_event, providerId: string) => {
    removeCredential(providerId);
  });

  ipcMain.handle('ai-provider:connect-free', (_event, providerId: string) => {
    setCredential(providerId, { type: 'api', key: 'public' });
  });

  // --- OAuth ---

  ipcMain.handle('ai-provider:start-oauth', async (_event, providerId: string, mode?: string) => {
    await waitForModelsReady();
    if (providerId === 'anthropic') {
      const clientId = getOAuthConfig('anthropic')?.clientId;
      if (!clientId) throw new Error('Anthropic OAuth client ID not configured');
      const anthropicMode = mode?.includes('console') ? 'console' : 'max';
      const { url, verifier } = await startAnthropicOAuth(anthropicMode, clientId);
      return { url, verifier, method: 'code' as const };
    }
    if (providerId === 'openai') {
      const clientId = getOAuthConfig('openai')?.clientId;
      if (!clientId) throw new Error('OpenAI OAuth client ID not configured');
      const result = await startOpenAIOAuth((id, cred) => setCredential(id, cred), clientId);
      return { ...result, method: 'auto' as const };
    }
    throw new Error(`OAuth is not supported for ${providerId}`);
  });

  ipcMain.handle(
    'ai-provider:complete-oauth',
    async (_event, providerId: string, code?: string, verifier?: string, mode?: string) => {
      await waitForModelsReady();
      if (providerId === 'anthropic') {
        if (!code || !verifier) {
          throw new Error('Anthropic OAuth requires code and verifier');
        }
        const clientId = getOAuthConfig('anthropic')?.clientId;
        if (!clientId) throw new Error('Anthropic OAuth client ID not configured');
        const anthropicMode = mode?.includes('console') ? 'console' : 'max';
        return completeAnthropicOAuth(code, verifier, anthropicMode, setCredential, clientId);
      }
      if (providerId === 'openai') {
        return completeOpenAIOAuth(getCredential);
      }
      throw new Error(`OAuth is not supported for ${providerId}`);
    },
  );

  // --- Health check ---

  ipcMain.handle('ai-provider:ping', (_event, providerId: string, modelId: string) =>
    pingProvider(providerId, modelId),
  );

  ipcMain.handle('ai-provider:refresh-models-dev', async () => {
    await fetchModels();
    autoConnectProviders(setCredential, getConnectedProviderIds);
    return { loaded: getModelsCache() !== null, error: getModelsCacheError() };
  });

  // --- Chat streaming ---

  ipcMain.handle('chat:start', (event, params: ChatStartParams) => {
    const chatId = startChat(params, event.sender.send.bind(event.sender));
    return { chatId };
  });

  ipcMain.handle('chat:abort', (_event, chatId: string) => {
    abortChat(chatId);
  });
}
