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
    create: (parentDir: string, name: string): Promise<string> =>
      ipcRenderer.invoke('workspace:create', parentDir, name),
    open: (): Promise<string | null> => ipcRenderer.invoke('workspace:open'),
    select: (path: string): Promise<void> => ipcRenderer.invoke('workspace:select', path),
    remove: (path: string): Promise<void> => ipcRenderer.invoke('workspace:remove', path),
    stop: (): Promise<void> => ipcRenderer.invoke('workspace:stop'),
    chooseDirectory: (): Promise<string | null> => ipcRenderer.invoke('workspace:chooseDirectory'),
    getDefaultLocation: (): Promise<string> => ipcRenderer.invoke('workspace:getDefaultLocation'),
    getDocumentCount: (path: string): Promise<number> =>
      ipcRenderer.invoke('workspace:getDocumentCount', path),
    invalidateManifest: (): Promise<void> => ipcRenderer.invoke('workspace:invalidateManifest'),
    onStatusChange: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('workspace:status-change', listener);
      return () => ipcRenderer.removeListener('workspace:status-change', listener);
    },
    onError: (callback: (data: unknown) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
      ipcRenderer.on('workspace:error', listener);
      return () => ipcRenderer.removeListener('workspace:error', listener);
    },
  },
  snapshot: {
    readDocumentFiles: (workspacePath: string, slug: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('snapshot:readDocumentFiles', workspacePath, slug),
    createDocument: (
      workspacePath: string,
      slug: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ): Promise<string> =>
      ipcRenderer.invoke(
        'snapshot:createDocument',
        workspacePath,
        slug,
        files,
        promptExcerpt,
        assistantMessageId,
      ),
    restoreDocument: (workspacePath: string, slug: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:restoreDocument', workspacePath, slug, snapshotId),
    listDocument: (workspacePath: string, slug: string): Promise<unknown> =>
      ipcRenderer.invoke('snapshot:listDocument', workspacePath, slug),
    deleteDocument: (workspacePath: string, slug: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:deleteDocument', workspacePath, slug, snapshotId),

    readStylesFile: (workspacePath: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke('snapshot:readStylesFile', workspacePath),
    createStyles: (
      workspacePath: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ): Promise<string> =>
      ipcRenderer.invoke(
        'snapshot:createStyles',
        workspacePath,
        files,
        promptExcerpt,
        assistantMessageId,
      ),
    restoreStyles: (workspacePath: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:restoreStyles', workspacePath, snapshotId),
    listStyles: (workspacePath: string): Promise<unknown> =>
      ipcRenderer.invoke('snapshot:listStyles', workspacePath),
    deleteStyles: (workspacePath: string, snapshotId: string): Promise<void> =>
      ipcRenderer.invoke('snapshot:deleteStyles', workspacePath, snapshotId),
  },
  assets: {
    list: (workspacePath: string, dirPath: string, recursive?: boolean): Promise<unknown> =>
      ipcRenderer.invoke('assets:list', workspacePath, dirPath, recursive),
    upload: (
      workspacePath: string,
      dirPath: string,
      files: { name: string; data: Uint8Array }[],
    ): Promise<void> => ipcRenderer.invoke('assets:upload', workspacePath, dirPath, files),
    createDirectory: (workspacePath: string, dirPath: string): Promise<void> =>
      ipcRenderer.invoke('assets:createDirectory', workspacePath, dirPath),
    delete: (workspacePath: string, entryPath: string): Promise<void> =>
      ipcRenderer.invoke('assets:delete', workspacePath, entryPath),
    rename: (workspacePath: string, oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke('assets:rename', workspacePath, oldPath, newPath),
  },
});
