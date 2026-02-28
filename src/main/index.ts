import { delimiter, join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  session,
  shell,
} from 'electron';
import type { WorkspaceState } from '../shared/types';
import { getActiveWorkspace, setActiveWorkspace } from './active-workspace-store';
import {
  createAssetDirectory,
  deleteAsset,
  listAssets,
  renameAsset,
  uploadAssets,
} from './assets-manager';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  initAutoUpdater,
  installUpdate,
} from './auto-updater';
import { DocumentExporter, exportPage } from './exporter';
import { OpencodeManager } from './opencode-manager';
import { buildPage } from './renderer';
import { initSentry } from './sentry';
import {
  createDocumentSnapshot,
  createStylesSnapshot,
  deleteDocumentSnapshot,
  deleteStylesSnapshot,
  listDocumentSnapshots,
  listStylesSnapshots,
  readDocumentFiles,
  readStylesFile,
  restoreDocumentSnapshot,
  restoreStylesSnapshot,
} from './snapshot-manager';
import {
  getTelemetryEnabled,
  getTheme,
  getUserProfile,
  setTelemetryEnabled,
  setTheme,
  setUserProfile,
  type Theme,
} from './telemetry-store';
import {
  closeAllDbs,
  createDocument,
  createNewWorkspace,
  deleteDocument,
  getDocumentCount,
  listDocumentsFull,
  listWorkspaces,
  readAssetFile,
  readDesignSystem,
  readWorkspaceConfig,
  updateDesignTokens,
  updateDocumentFolder,
} from './workspace-data';
import { resolveWorkspacePath } from './workspace-paths';

initSentry();

const documentExporter = new DocumentExporter();
const opencodeManager = new OpencodeManager();
let mainWindow: BrowserWindow | null = null;

function getWorkspaceState(): WorkspaceState {
  const workspaceName = getActiveWorkspace();
  return {
    status: workspaceName ? 'active' : 'inactive',
    workspaceName,
    workspacePath: workspaceName ? resolveWorkspacePath(workspaceName) : null,
  };
}

function emitWorkspaceChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace:changed', getWorkspaceState());
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// IPC handlers
ipcMain.handle('telemetry:getEnabled', () => getTelemetryEnabled());
ipcMain.handle('telemetry:setEnabled', (_event, value: boolean) => setTelemetryEnabled(value));
ipcMain.handle('preferences:getUserProfile', () => getUserProfile());
ipcMain.handle('preferences:setUserProfile', (_event, name: string, email: string) =>
  setUserProfile(name, email),
);
ipcMain.handle('preferences:getTheme', () => getTheme());
ipcMain.handle('preferences:setTheme', (_event, value: Theme) => setTheme(value));
ipcMain.handle('opencode:status', () => opencodeManager.getStatus());
ipcMain.handle('opencode:start', () => opencodeManager.start());
ipcMain.handle('opencode:restart', () => opencodeManager.restart());
ipcMain.handle('opencode:stop', () => opencodeManager.stop());
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('update:download', () => downloadUpdate());
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('update:getState', () => getUpdateState());

// Export IPC handlers
ipcMain.handle(
  'export:saveDialog',
  async (_event, options: { format: string; title: string; isZip: boolean }) => {
    if (!mainWindow) return null;
    const ext = options.isZip ? 'zip' : options.format === 'pdf' ? 'pdf' : options.format;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${options.title}.${ext}`,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  },
);

ipcMain.handle('export:start', async (_event, request) => {
  await documentExporter.exportDocument(request);
});

ipcMain.handle('export:getProgress', () => documentExporter.getProgress());

// Workspace IPC handlers
ipcMain.handle('workspace:list', async () => {
  const slugs = await listWorkspaces();
  return Promise.all(
    slugs.map(async (slug) => {
      const [config, documentCount] = await Promise.all([
        readWorkspaceConfig(slug).catch(() => ({ name: slug })),
        getDocumentCount(slug).catch(() => 0),
      ]);
      return { slug, name: config.name, documentCount };
    }),
  );
});

ipcMain.handle('workspace:getActive', () => getWorkspaceState());

ipcMain.handle('workspace:create', async (_event, name: string) => {
  const slug = await createNewWorkspace(name);
  setActiveWorkspace(slug);
  emitWorkspaceChanged();
  return slug;
});

ipcMain.handle('workspace:select', (_event, workspaceName: string) => {
  setActiveWorkspace(workspaceName);
  emitWorkspaceChanged();
});

ipcMain.handle('workspace:stop', () => {
  setActiveWorkspace(null);
  emitWorkspaceChanged();
});

ipcMain.handle('workspace:getDocumentCount', (_event, workspaceName: string) =>
  getDocumentCount(workspaceName),
);

// Document CRUD IPC handlers
ipcMain.handle('document:list', (_event, ws: string) => listDocumentsFull(ws));
ipcMain.handle(
  'document:create',
  (_event, ws: string, title: string, size: string, folder?: string) =>
    createDocument(ws, title, size, folder),
);
ipcMain.handle('document:delete', (_event, ws: string, docId: string) => deleteDocument(ws, docId));
ipcMain.handle('document:updateFolder', (_event, ws: string, docId: string, folder: string) =>
  updateDocumentFolder(ws, docId, folder),
);

// Design System IPC handlers
ipcMain.handle('designSystem:read', (_event, ws: string) => readDesignSystem(ws));
ipcMain.handle(
  'designSystem:updateTokens',
  (_event, ws: string, updates: Array<{ variable: string; value: string }>) =>
    updateDesignTokens(ws, updates),
);

// Snapshot IPC handlers
ipcMain.handle('snapshot:readDocumentFiles', (_event, workspaceName: string, docId: string) =>
  readDocumentFiles(workspaceName, docId),
);
ipcMain.handle(
  'snapshot:createDocument',
  (
    _event,
    workspaceName: string,
    docId: string,
    files: Record<string, string>,
    promptExcerpt: string,
    assistantMessageId: string,
  ) => createDocumentSnapshot(workspaceName, docId, files, promptExcerpt, assistantMessageId, 20),
);
ipcMain.handle(
  'snapshot:restoreDocument',
  (_event, workspaceName: string, docId: string, snapshotId: string) =>
    restoreDocumentSnapshot(workspaceName, docId, snapshotId),
);
ipcMain.handle('snapshot:listDocument', (_event, workspaceName: string, docId: string) =>
  listDocumentSnapshots(workspaceName, docId),
);
ipcMain.handle(
  'snapshot:deleteDocument',
  (_event, workspaceName: string, docId: string, snapshotId: string) =>
    deleteDocumentSnapshot(workspaceName, docId, snapshotId),
);

ipcMain.handle('snapshot:readStylesFile', (_event, workspaceName: string) =>
  readStylesFile(workspaceName),
);
ipcMain.handle(
  'snapshot:createStyles',
  (
    _event,
    workspaceName: string,
    files: Record<string, string>,
    promptExcerpt: string,
    assistantMessageId: string,
  ) => createStylesSnapshot(workspaceName, files, promptExcerpt, assistantMessageId, 20),
);
ipcMain.handle('snapshot:restoreStyles', (_event, workspaceName: string, snapshotId: string) =>
  restoreStylesSnapshot(workspaceName, snapshotId),
);
ipcMain.handle('snapshot:listStyles', (_event, workspaceName: string) =>
  listStylesSnapshots(workspaceName),
);
ipcMain.handle('snapshot:deleteStyles', (_event, workspaceName: string, snapshotId: string) =>
  deleteStylesSnapshot(workspaceName, snapshotId),
);

ipcMain.handle(
  'assets:list',
  (_event, workspaceName: string, dirPath: string, recursive?: boolean) =>
    listAssets(resolveWorkspacePath(workspaceName), dirPath, recursive),
);
ipcMain.handle(
  'assets:upload',
  (_event, workspaceName: string, dirPath: string, files: { name: string; data: Uint8Array }[]) =>
    uploadAssets(resolveWorkspacePath(workspaceName), dirPath, files),
);
ipcMain.handle('assets:createDirectory', (_event, workspaceName: string, dirPath: string) =>
  createAssetDirectory(resolveWorkspacePath(workspaceName), dirPath),
);
ipcMain.handle('assets:delete', (_event, workspaceName: string, entryPath: string) =>
  deleteAsset(resolveWorkspacePath(workspaceName), entryPath),
);
ipcMain.handle('assets:rename', (_event, workspaceName: string, oldPath: string, newPath: string) =>
  renameAsset(resolveWorkspacePath(workspaceName), oldPath, newPath),
);

// Renderer
ipcMain.handle(
  'renderer:build',
  (_event, ws: string, doc: string, page: string, approach?: 'ssr' | 'csr') =>
    buildPage(ws, doc, page, approach),
);
ipcMain.handle('renderer:export', (_event, options) => exportPage(options));

// Forward opencode status changes to renderer
opencodeManager.on('status-change', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('opencode:status-change', data);
  }
});

// Forward export progress to renderer
documentExporter.on('progress', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('export:progress', data);
  }
});

// Listen for system theme changes
nativeTheme.on('updated', () => {
  const theme = getTheme();
  if (theme === 'system' && mainWindow && !mainWindow.isDestroyed()) {
    const isDark = nativeTheme.shouldUseDarkColors;
    mainWindow.webContents.send('preferences:theme-change', isDark ? 'dark' : 'light');
  }
});

app.whenReady().then(async () => {
  if (process.argv.includes('--batch-export')) {
    const { runBatchExport } = await import('./exporter/batch-export');
    try {
      await runBatchExport();
    } catch (err) {
      console.error('[batch-export] Fatal:', err);
      process.exit(1);
    }
    app.quit();
    return;
  }

  electronApp.setAppUserModelId('com.litho');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Register litho-asset:// protocol for serving workspace assets
  protocol.handle('litho-asset', async (request) => {
    try {
      const url = new URL(request.url);
      const workspaceName = url.hostname;
      const assetPath = decodeURIComponent(url.pathname.slice(1));
      const { data, mimeType } = await readAssetFile(workspaceName, assetPath);
      return new Response(new Uint8Array(data), { headers: { 'Content-Type': mimeType } });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  createWindow();
  if (mainWindow) {
    initAutoUpdater(mainWindow);
  }
  setTimeout(() => checkForUpdates(), 30_000);

  // Inject CORS headers for OpenCode server responses
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://127.0.0.1:*/*', 'http://localhost:*/*'] },
    (details, callback) => {
      const headers: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
        if (!key.toLowerCase().startsWith('access-control-')) {
          headers[key] = value;
        }
      }
      headers['Access-Control-Allow-Origin'] = ['*'];
      headers['Access-Control-Allow-Methods'] = ['GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS'];
      headers['Access-Control-Allow-Headers'] = ['Content-Type, x-opencode-directory'];
      callback({ responseHeaders: headers });
    },
  );

  // Prepend bundled opencode binary to PATH so the SDK can spawn it
  const binDir = app.isPackaged
    ? join(process.resourcesPath, 'bin')
    : join(app.getAppPath(), 'resources', 'bin');
  process.env.PATH = binDir + delimiter + (process.env.PATH ?? '');

  // Start the opencode server
  void opencodeManager.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  event.preventDefault();
  closeAllDbs();
  void opencodeManager
    .stop()
    .catch(() => {})
    .finally(() => app.exit());
});
