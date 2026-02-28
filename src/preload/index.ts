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
  opencode: {
    getStatus: (): Promise<unknown> => ipcRenderer.invoke('opencode:status'),
    start: (): Promise<void> => ipcRenderer.invoke('opencode:start'),
    restart: (): Promise<void> => ipcRenderer.invoke('opencode:restart'),
    stop: (): Promise<void> => ipcRenderer.invoke('opencode:stop'),
    onStatusChange: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('opencode:status-change', listener);
      return () => ipcRenderer.removeListener('opencode:status-change', listener);
    },
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    getPlatform: (): Promise<string> => ipcRenderer.invoke('app:getPlatform'),
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
    onChanged: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('workspace:changed', listener);
      return () => ipcRenderer.removeListener('workspace:changed', listener);
    },
  },
  document: {
    list: (workspaceName: string): Promise<unknown> =>
      ipcRenderer.invoke('document:list', workspaceName),
    create: (
      workspaceName: string,
      title: string,
      size: string,
      folder?: string,
    ): Promise<string> => ipcRenderer.invoke('document:create', workspaceName, title, size, folder),
    delete: (workspaceName: string, docId: string): Promise<void> =>
      ipcRenderer.invoke('document:delete', workspaceName, docId),
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
  snapshot: {
    readDocumentFiles: (workspaceName: string, docId: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('snapshot:readDocumentFiles', workspaceName, docId),
    createDocument: (
      workspaceName: string,
      docId: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ): Promise<string> =>
      ipcRenderer.invoke(
        'snapshot:createDocument',
        workspaceName,
        docId,
        files,
        promptExcerpt,
        assistantMessageId,
      ),
    restoreDocument: (workspaceName: string, docId: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:restoreDocument', workspaceName, docId, snapshotId),
    listDocument: (workspaceName: string, docId: string): Promise<unknown> =>
      ipcRenderer.invoke('snapshot:listDocument', workspaceName, docId),
    deleteDocument: (workspaceName: string, docId: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:deleteDocument', workspaceName, docId, snapshotId),

    readStylesFile: (workspaceName: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('snapshot:readStylesFile', workspaceName),
    createStyles: (
      workspaceName: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ): Promise<string> =>
      ipcRenderer.invoke(
        'snapshot:createStyles',
        workspaceName,
        files,
        promptExcerpt,
        assistantMessageId,
      ),
    restoreStyles: (workspaceName: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:restoreStyles', workspaceName, snapshotId),
    listStyles: (workspaceName: string): Promise<unknown> =>
      ipcRenderer.invoke('snapshot:listStyles', workspaceName),
    deleteStyles: (workspaceName: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:deleteStyles', workspaceName, snapshotId),
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
