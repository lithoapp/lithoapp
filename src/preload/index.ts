import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('litho', {
  preferences: {
    getUserProfile: (): Promise<{ name: string | null; email: string | null }> =>
      ipcRenderer.invoke('preferences:getUserProfile'),
    setUserProfile: (name: string, email: string): Promise<void> =>
      ipcRenderer.invoke('preferences:setUserProfile', name, email),
    getTheme: (): Promise<'dark' | 'light' | 'system'> =>
      ipcRenderer.invoke('preferences:getTheme'),
    setTheme: (value: 'dark' | 'light' | 'system'): Promise<void> =>
      ipcRenderer.invoke('preferences:setTheme', value),
    onThemeChange: (callback: (value: 'dark' | 'light') => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: 'dark' | 'light'): void =>
        callback(value);
      ipcRenderer.on('preferences:theme-change', listener);
      return () => ipcRenderer.removeListener('preferences:theme-change', listener);
    },
  },
  telemetry: {
    getEnabled: (): Promise<boolean> => ipcRenderer.invoke('telemetry:getEnabled'),
    setEnabled: (value: boolean): Promise<void> =>
      ipcRenderer.invoke('telemetry:setEnabled', value),
  },
  advancedTools: {
    getEnabled: (): Promise<boolean> => ipcRenderer.invoke('advancedTools:getEnabled'),
    setEnabled: (value: boolean): Promise<void> =>
      ipcRenderer.invoke('advancedTools:setEnabled', value),
    exportSource: (): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('advancedTools:exportSource'),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    getPlatform: (): Promise<string> => ipcRenderer.invoke('app:getPlatform'),
    setTitleBarOverlay: (color: string, symbolColor: string): Promise<void> =>
      ipcRenderer.invoke('app:setTitleBarOverlay', color, symbolColor),
  },
  update: {
    check: (): Promise<void> => ipcRenderer.invoke('update:check'),
    download: (): Promise<void> => ipcRenderer.invoke('update:download'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    getState: (): Promise<unknown> => ipcRenderer.invoke('update:getState'),
    onStatus: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('update:status', listener);
      return () => ipcRenderer.removeListener('update:status', listener);
    },
  },
  export: {
    start: (request: unknown): Promise<void> => ipcRenderer.invoke('export:start', request),
    getProgress: (): Promise<unknown> => ipcRenderer.invoke('export:getProgress'),
    saveDialog: (options: unknown): Promise<string | null> =>
      ipcRenderer.invoke('export:saveDialog', options),
    onProgress: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('export:progress', listener);
      return () => ipcRenderer.removeListener('export:progress', listener);
    },
  },
  workspace: {
    list: (): Promise<unknown> => ipcRenderer.invoke('workspace:list'),
    getActive: (): Promise<unknown> => ipcRenderer.invoke('workspace:getActive'),
    create: (name: string): Promise<string> => ipcRenderer.invoke('workspace:create', name),
    select: (name: string): Promise<void> => ipcRenderer.invoke('workspace:select', name),
    stop: (): Promise<void> => ipcRenderer.invoke('workspace:stop'),
    getDocumentCount: (name: string): Promise<number> =>
      ipcRenderer.invoke('workspace:getDocumentCount', name),
    getDesignSystemDocId: (name: string): Promise<string | null> =>
      ipcRenderer.invoke('workspace:getDesignSystemDocId', name),
    getDesignSystemDocInfo: (name: string): Promise<unknown> =>
      ipcRenderer.invoke('workspace:getDesignSystemDocInfo', name),
    onChanged: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('workspace:changed', listener);
      return () => ipcRenderer.removeListener('workspace:changed', listener);
    },
  },
  document: {
    list: (workspaceName: string): Promise<unknown> =>
      ipcRenderer.invoke('document:list', workspaceName),
    read: (workspaceName: string, docId: string): Promise<unknown> =>
      ipcRenderer.invoke('document:read', workspaceName, docId),
    create: (
      workspaceName: string,
      title: string,
      size: string,
      folder?: string,
    ): Promise<string> => ipcRenderer.invoke('document:create', workspaceName, title, size, folder),
    delete: (workspaceName: string, docId: string): Promise<void> =>
      ipcRenderer.invoke('document:delete', workspaceName, docId),
    rename: (workspaceName: string, docId: string, newTitle: string): Promise<void> =>
      ipcRenderer.invoke('document:rename', workspaceName, docId, newTitle),
    duplicate: (workspaceName: string, docId: string): Promise<string> =>
      ipcRenderer.invoke('document:duplicate', workspaceName, docId),
    updateFolder: (workspaceName: string, docId: string, folder: string): Promise<void> =>
      ipcRenderer.invoke('document:updateFolder', workspaceName, docId, folder),
  },
  designSystem: {
    read: (workspaceName: string): Promise<unknown> =>
      ipcRenderer.invoke('designSystem:read', workspaceName),
    updateTokens: (
      workspaceName: string,
      updates: Array<{ variable: string; value: string }>,
    ): Promise<void> => ipcRenderer.invoke('designSystem:updateTokens', workspaceName, updates),
  },
  renderer: {
    build: (
      workspace: string,
      document: string,
      page: string,
      approach?: 'ssr' | 'csr',
    ): Promise<unknown> =>
      ipcRenderer.invoke('renderer:build', workspace, document, page, approach),
    export: (options: {
      html: string;
      approach: 'ssr' | 'csr';
      format: 'pdf' | 'png' | 'jpg';
      size: { width: number; height: number; unit: 'mm' | 'px' };
      dpi: number;
      jpgQuality: number;
      savePath: string;
    }): Promise<unknown> => ipcRenderer.invoke('renderer:export', options),
    validateCss: (workspace: string): Promise<{ ok: true } | { ok: false; errors: string[] }> =>
      ipcRenderer.invoke('renderer:validateCss', workspace),
  },
  aiProvider: {
    list: (): Promise<unknown> => ipcRenderer.invoke('ai-provider:list'),
    models: (providerId: string): Promise<unknown> =>
      ipcRenderer.invoke('ai-provider:models', providerId),
    authMethods: (providerId: string): Promise<unknown> =>
      ipcRenderer.invoke('ai-provider:auth-methods', providerId),
    connectApiKey: (providerId: string, key: string): Promise<void> =>
      ipcRenderer.invoke('ai-provider:connect-api-key', providerId, key),
    disconnect: (providerId: string): Promise<void> =>
      ipcRenderer.invoke('ai-provider:disconnect', providerId),
    startOAuth: (
      providerId: string,
      mode?: string,
    ): Promise<{ url: string; verifier?: string; method: 'auto' | 'code' }> =>
      ipcRenderer.invoke('ai-provider:start-oauth', providerId, mode),
    completeOAuth: (
      providerId: string,
      code?: string,
      verifier?: string,
      mode?: string,
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('ai-provider:complete-oauth', providerId, code, verifier, mode),
    connectFree: (providerId: string): Promise<void> =>
      ipcRenderer.invoke('ai-provider:connect-free', providerId),
    ping: (providerId: string, modelId: string): Promise<unknown> =>
      ipcRenderer.invoke('ai-provider:ping', providerId, modelId),
    refreshModelsDev: (): Promise<{ loaded: boolean; error: string | null }> =>
      ipcRenderer.invoke('ai-provider:refresh-models-dev'),
  },
  chat: {
    start: (params: unknown): Promise<{ chatId: string }> =>
      ipcRenderer.invoke('chat:start', params),
    abort: (chatId: string): Promise<void> => ipcRenderer.invoke('chat:abort', chatId),
    onDelta: (callback: (chatId: string, data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, chatId: string, data: unknown): void =>
        callback(chatId, data);
      ipcRenderer.on('chat:delta', listener);
      return () => ipcRenderer.removeListener('chat:delta', listener);
    },
  },
  conversation: {
    load: (workspace: string, documentId: string): Promise<unknown> =>
      ipcRenderer.invoke('conversation:load', workspace, documentId),
    save: (
      workspace: string,
      documentId: string,
      messages: unknown,
      usage: { inputTokens: number; outputTokens: number },
    ): Promise<void> =>
      ipcRenderer.invoke('conversation:save', workspace, documentId, messages, usage),
    clear: (workspace: string, documentId: string): Promise<void> =>
      ipcRenderer.invoke('conversation:clear', workspace, documentId),
  },
  snapshot: {
    create: (
      workspace: string,
      documentId: string,
      userMessageId: string,
      messages: unknown,
      usage: { inputTokens: number; outputTokens: number },
    ): Promise<void> =>
      ipcRenderer.invoke('snapshot:create', workspace, documentId, userMessageId, messages, usage),
    revert: (workspace: string, documentId: string, userMessageId: string): Promise<unknown> =>
      ipcRenderer.invoke('snapshot:revert', workspace, documentId, userMessageId),
  },
  assets: {
    list: (workspaceName: string, dirPath: string, recursive?: boolean): Promise<unknown> =>
      ipcRenderer.invoke('assets:list', workspaceName, dirPath, recursive),
    upload: (
      workspaceName: string,
      dirPath: string,
      files: { name: string; data: Uint8Array }[],
    ): Promise<void> => ipcRenderer.invoke('assets:upload', workspaceName, dirPath, files),
    createDirectory: (workspaceName: string, dirPath: string): Promise<void> =>
      ipcRenderer.invoke('assets:createDirectory', workspaceName, dirPath),
    delete: (workspaceName: string, entryPath: string): Promise<void> =>
      ipcRenderer.invoke('assets:delete', workspaceName, entryPath),
    rename: (workspaceName: string, oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke('assets:rename', workspaceName, oldPath, newPath),
  },
});
