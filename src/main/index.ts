import { accessSync, constants, existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { slugify } from '@kareemaly/litho-workspace-server';
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from 'electron';
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
import { WorkspaceManager } from './workspace-manager';
import {
  addWorkspace,
  getActiveWorkspacePath,
  getWorkspaces,
  removeWorkspace,
  setActiveWorkspacePath,
  touchWorkspace,
} from './workspace-store';

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
ipcMain.handle('workspace:list', () => getWorkspaces());
ipcMain.handle('workspace:getActive', () => workspaceManager.getInfo());

ipcMain.handle('workspace:create', async (_event, parentDir: string, name: string) => {
  const slug = slugify(name) || 'untitled';
  const targetPath = join(parentDir, slug);

  if (existsSync(targetPath)) {
    throw new Error(
      `A project already exists at "${targetPath}". Choose a different name or location.`,
    );
  }

  if (!existsSync(parentDir)) {
    throw new Error(`The folder "${parentDir}" does not exist. Choose a different location.`);
  }

  try {
    accessSync(parentDir, constants.W_OK);
  } catch {
    throw new Error(
      `You don't have permission to create files in "${parentDir}". Choose a different location.`,
    );
  }

  try {
    const root = await workspaceManager.createAndStart(targetPath, name);
    addWorkspace({ path: root, name, lastOpened: new Date().toISOString() });
    setActiveWorkspacePath(root);
    return root;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('ENOSPC') || message.includes('no space')) {
      throw new Error('Your disk is full. Free up some space and try again.');
    }
    if (message.includes('EACCES') || message.includes('EPERM')) {
      throw new Error(
        `You don't have permission to create files in "${parentDir}". Choose a different location.`,
      );
    }
    throw new Error(`Could not create project: ${message}`);
  }
});

ipcMain.handle('workspace:open', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Open Workspace',
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const dirPath = result.filePaths[0];
  const lithoJsonPath = join(dirPath, 'litho.json');
  if (!existsSync(lithoJsonPath)) {
    throw new Error('Selected directory is not a Litho workspace (missing litho.json)');
  }

  const config = JSON.parse(readFileSync(lithoJsonPath, 'utf-8'));
  const name = config.name || 'Untitled Workspace';

  addWorkspace({ path: dirPath, name, lastOpened: new Date().toISOString() });
  setActiveWorkspacePath(dirPath);
  await workspaceManager.startWorkspace(dirPath, name);
  return dirPath;
});

ipcMain.handle('workspace:select', async (_event, workspacePath: string) => {
  const workspaces = getWorkspaces();
  const entry = workspaces.find((w) => w.path === workspacePath);
  if (!entry) throw new Error('Workspace not in registry');

  touchWorkspace(workspacePath);
  setActiveWorkspacePath(workspacePath);
  await workspaceManager.switchWorkspace(workspacePath, entry.name);
});

ipcMain.handle('workspace:remove', async (_event, workspacePath: string) => {
  const info = workspaceManager.getInfo();
  if (info.workspacePath === workspacePath) {
    await workspaceManager.stop();
    setActiveWorkspacePath(null);
  }
  removeWorkspace(workspacePath);
});

ipcMain.handle('workspace:stop', async () => {
  setActiveWorkspacePath(null);
  await workspaceManager.stop();
});

ipcMain.handle('workspace:getDefaultLocation', () => join(homedir(), 'litho-workspaces'));

ipcMain.handle('workspace:getDocumentCount', (_event, workspacePath: string) => {
  const docsDir = join(workspacePath, 'documents');
  if (!existsSync(docsDir)) return 0;
  return readdirSync(docsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
});

ipcMain.handle('workspace:chooseDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose Location for New Workspace',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Snapshot IPC handlers
ipcMain.handle('snapshot:readDocumentFiles', (_event, workspacePath: string, slug: string) =>
  readDocumentFiles(workspacePath, slug),
);
ipcMain.handle(
  'snapshot:createDocument',
  (
    _event,
    workspacePath: string,
    slug: string,
    files: Record<string, string>,
    promptExcerpt: string,
    assistantMessageId: string,
  ) => createDocumentSnapshot(workspacePath, slug, files, promptExcerpt, assistantMessageId, 20),
);
ipcMain.handle(
  'snapshot:restoreDocument',
  (_event, workspacePath: string, slug: string, snapshotId: string) =>
    restoreDocumentSnapshot(workspacePath, slug, snapshotId),
);
ipcMain.handle('snapshot:listDocument', (_event, workspacePath: string, slug: string) =>
  listDocumentSnapshots(workspacePath, slug),
);
ipcMain.handle(
  'snapshot:deleteDocument',
  (_event, workspacePath: string, slug: string, snapshotId: string) =>
    deleteDocumentSnapshot(workspacePath, slug, snapshotId),
);

ipcMain.handle('snapshot:readStylesFile', (_event, workspacePath: string) =>
  readStylesFile(workspacePath),
);
ipcMain.handle(
  'snapshot:createStyles',
  (
    _event,
    workspacePath: string,
    files: Record<string, string>,
    promptExcerpt: string,
    assistantMessageId: string,
  ) => createStylesSnapshot(workspacePath, files, promptExcerpt, assistantMessageId, 20),
);
ipcMain.handle('snapshot:restoreStyles', (_event, workspacePath: string, snapshotId: string) =>
  restoreStylesSnapshot(workspacePath, snapshotId),
);
ipcMain.handle('snapshot:listStyles', (_event, workspacePath: string) =>
  listStylesSnapshots(workspacePath),
);
ipcMain.handle('snapshot:deleteStyles', (_event, workspacePath: string, snapshotId: string) =>
  deleteStylesSnapshot(workspacePath, snapshotId),
);

ipcMain.handle(
  'assets:list',
  (_event, workspacePath: string, dirPath: string, recursive?: boolean) =>
    listAssets(workspacePath, dirPath, recursive),
);
ipcMain.handle(
  'assets:upload',
  (_event, workspacePath: string, dirPath: string, files: { name: string; data: Uint8Array }[]) =>
    uploadAssets(workspacePath, dirPath, files),
);
ipcMain.handle('assets:createDirectory', (_event, workspacePath: string, dirPath: string) =>
  createAssetDirectory(workspacePath, dirPath),
);
ipcMain.handle('assets:delete', (_event, workspacePath: string, entryPath: string) =>
  deleteAsset(workspacePath, entryPath),
);
ipcMain.handle('assets:rename', (_event, workspacePath: string, oldPath: string, newPath: string) =>
  renameAsset(workspacePath, oldPath, newPath),
);

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
  const lastActive = getActiveWorkspacePath();
  if (lastActive) {
    const workspaces = getWorkspaces();
    const entry = workspaces.find((w) => w.path === lastActive);
    if (entry) {
      void workspaceManager.startWorkspace(lastActive, entry.name);
    }
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
