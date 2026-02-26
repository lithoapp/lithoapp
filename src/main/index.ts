import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { invalidateManifestCache, slugify } from '@kareemaly/litho-workspace-server';
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from 'electron';
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
import { ExportManager } from './export-manager';
import { OpencodeManager } from './opencode-manager';
import {
  buildPage,
  exportPageResult,
  listDocuments,
  listPages,
  readDocumentConfig,
  listWorkspaces as rendererListWorkspaces,
} from './renderer';
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
import { getDocumentCount, listWorkspaces, readWorkspaceConfig } from './workspace-data';
import { WorkspaceManager } from './workspace-manager';
import { resolveWorkspacePath } from './workspace-paths';

initSentry();

const exportManager = new ExportManager();
const opencodeManager = new OpencodeManager();
const workspaceManager = new WorkspaceManager();
let mainWindow: BrowserWindow | null = null;

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
  await exportManager.exportDocument(request);
});

ipcMain.handle('export:getProgress', () => exportManager.getProgress());

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

ipcMain.handle('workspace:getActive', () => workspaceManager.getInfo());

ipcMain.handle('workspace:create', async (_event, name: string) => {
  const slug = slugify(name) || 'untitled';
  const targetPath = resolveWorkspacePath(slug);

  if (existsSync(targetPath)) {
    throw new Error(`A project named "${slug}" already exists. Choose a different name.`);
  }

  try {
    const createdSlug = await workspaceManager.createAndStart(name);
    setActiveWorkspace(createdSlug);
    return createdSlug;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOSPC') || message.includes('no space')) {
      throw new Error('Your disk is full. Free up some space and try again.');
    }
    throw new Error(`Could not create project: ${message}`);
  }
});

ipcMain.handle('workspace:select', async (_event, workspaceName: string) => {
  setActiveWorkspace(workspaceName);
  await workspaceManager.switchWorkspace(workspaceName);
});

ipcMain.handle('workspace:stop', async () => {
  setActiveWorkspace(null);
  await workspaceManager.stop();
});

ipcMain.handle('workspace:invalidateManifest', () => invalidateManifestCache());

ipcMain.handle('workspace:getDocumentCount', (_event, workspaceName: string) =>
  getDocumentCount(workspaceName),
);

// Snapshot IPC handlers
ipcMain.handle('snapshot:readDocumentFiles', (_event, workspaceName: string, slug: string) =>
  readDocumentFiles(resolveWorkspacePath(workspaceName), slug),
);
ipcMain.handle(
  'snapshot:createDocument',
  (
    _event,
    workspaceName: string,
    slug: string,
    files: Record<string, string>,
    promptExcerpt: string,
    assistantMessageId: string,
  ) =>
    createDocumentSnapshot(
      resolveWorkspacePath(workspaceName),
      slug,
      files,
      promptExcerpt,
      assistantMessageId,
      20,
    ),
);
ipcMain.handle(
  'snapshot:restoreDocument',
  (_event, workspaceName: string, slug: string, snapshotId: string) =>
    restoreDocumentSnapshot(resolveWorkspacePath(workspaceName), slug, snapshotId),
);
ipcMain.handle('snapshot:listDocument', (_event, workspaceName: string, slug: string) =>
  listDocumentSnapshots(resolveWorkspacePath(workspaceName), slug),
);
ipcMain.handle(
  'snapshot:deleteDocument',
  (_event, workspaceName: string, slug: string, snapshotId: string) =>
    deleteDocumentSnapshot(resolveWorkspacePath(workspaceName), slug, snapshotId),
);

ipcMain.handle('snapshot:readStylesFile', (_event, workspaceName: string) =>
  readStylesFile(resolveWorkspacePath(workspaceName)),
);
ipcMain.handle(
  'snapshot:createStyles',
  (
    _event,
    workspaceName: string,
    files: Record<string, string>,
    promptExcerpt: string,
    assistantMessageId: string,
  ) =>
    createStylesSnapshot(
      resolveWorkspacePath(workspaceName),
      files,
      promptExcerpt,
      assistantMessageId,
      20,
    ),
);
ipcMain.handle('snapshot:restoreStyles', (_event, workspaceName: string, snapshotId: string) =>
  restoreStylesSnapshot(resolveWorkspacePath(workspaceName), snapshotId),
);
ipcMain.handle('snapshot:listStyles', (_event, workspaceName: string) =>
  listStylesSnapshots(resolveWorkspacePath(workspaceName)),
);
ipcMain.handle('snapshot:deleteStyles', (_event, workspaceName: string, snapshotId: string) =>
  deleteStylesSnapshot(resolveWorkspacePath(workspaceName), snapshotId),
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
ipcMain.handle('renderer:list-workspaces', () => rendererListWorkspaces());
ipcMain.handle('renderer:list-documents', (_event, ws: string) => listDocuments(ws));
ipcMain.handle('renderer:list-pages', (_event, ws: string, doc: string) => listPages(ws, doc));
ipcMain.handle('renderer:read-document-config', (_event, ws: string, doc: string) =>
  readDocumentConfig(ws, doc),
);
ipcMain.handle('renderer:export', (_event, options) => exportPageResult(options));

// Forward opencode status changes to renderer
opencodeManager.on('status-change', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('opencode:status-change', data);
  }
});

// Forward export progress to renderer
exportManager.on('progress', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('export:progress', data);
  }
});

// Forward workspace status changes to renderer
workspaceManager.on('status-change', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace:status-change', data);
  }
});

// Forward workspace errors to renderer
workspaceManager.on('error', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('workspace:error', data);
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
    const { runBatchExport } = await import('./batch-export');
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

  createWindow();
  if (mainWindow) {
    initAutoUpdater(mainWindow);
  }
  setTimeout(() => checkForUpdates(), 30_000);

  // Inject CORS headers for local server responses (opencode + workspace)
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

  // Restore last active workspace
  const lastActive = getActiveWorkspace();
  if (lastActive) {
    void workspaceManager.startWorkspace(lastActive);
  }

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
  void Promise.all([opencodeManager.stop(), workspaceManager.stop()])
    .catch(() => {})
    .finally(() => app.exit());
});
