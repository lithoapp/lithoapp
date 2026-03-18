import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { getAppNodeModulesPath } from './lib/paths';

const esbuildPlatform = `${process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'}-${process.arch}`;
const unpackedBase = join(getAppNodeModulesPath(), '@esbuild', esbuildPlatform);
const unpackedEsbuild =
  process.platform === 'win32'
    ? join(unpackedBase, 'esbuild.exe')
    : join(unpackedBase, 'bin', 'esbuild');
if (existsSync(unpackedEsbuild)) {
  process.env.ESBUILD_BINARY_PATH = unpackedEsbuild;
}

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  nativeTheme,
  protocol,
  shell,
} from 'electron';

app.setName('Litho');

import type { PageSizeName } from '../shared/types';
import { registerAiProviderHandlers } from './ai-providers';
import {
  clearAllCredentials,
  getConnectedProviderIds,
  setCredential,
} from './ai-providers/providers/credential-store';
import { autoConnectProviders } from './ai-providers/providers/models-cache';
import {
  createAssetDirectory,
  deleteAsset,
  deleteDocumentAsset,
  listAssets,
  listDocumentAssets,
  renameAsset,
  renameDocumentAsset,
  uploadAssets,
  uploadDocumentAssets,
} from './assets-manager';
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  initAutoUpdater,
  installUpdate,
} from './auto-updater';
import { DocumentExporter, exportPage } from './exporter';
import { buildExportFileName } from './exporter/export-filename';
import { captureFeedbackScreenshot } from './feedback';
import { buildAllTemplatePreviews, buildPage } from './renderer';
import { compileTailwind, formatCssError } from './renderer/build-shared';
import { initSentry, syncSentryUserProfile } from './sentry';
import {
  getTelemetryEnabled,
  getTheme,
  getUserProfile,
  resetPreferences,
  setTelemetryEnabled,
  setTheme,
  setUserProfile,
  type Theme,
} from './telemetry-store';
import {
  clearConversation,
  closeAllDbs,
  createDocument,
  createNewWorkspace,
  createSnapshot,
  deleteDocument,
  duplicateDocument,
  getDesignSystemDocId,
  getDesignSystemDocInfo,
  getDocumentCount,
  listDocumentsFull,
  listWorkspaces,
  loadConversation,
  readAssetFile,
  readDesignSystem,
  readDocumentConfig,
  readStyles,
  renameDocument,
  revertToSnapshot,
  saveConversation,
  updateDesignTokens,
  updateDocumentFolder,
  updateWorkspaceLastOpened,
} from './workspace-data';
import { getWorkspaceEntry } from './workspace-data/registry-db';
import { resolveWorkspacePath } from './workspace-paths';

initSentry();

const documentExporter = new DocumentExporter();
let mainWindow: BrowserWindow | null = null;

const appIcon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'));

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: true,
    icon: appIcon,
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

  // Allow opening DevTools in production with Ctrl+Shift+I / Cmd+Option+I
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const isDevToolsShortcut =
      input.type === 'keyDown' &&
      input.shift &&
      ((process.platform === 'darwin' && input.meta && input.key === 'i') ||
        (process.platform !== 'darwin' && input.control && input.key === 'I'));
    if (isDevToolsShortcut) {
      mainWindow?.webContents.toggleDevTools();
    }
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
ipcMain.handle('preferences:setUserProfile', (_event, name: string, email: string) => {
  setUserProfile(name, email);
  syncSentryUserProfile();
});
ipcMain.handle('preferences:getTheme', () => getTheme());
ipcMain.handle('preferences:setTheme', (_event, value: Theme) => setTheme(value));
ipcMain.handle('preferences:reset', () => {
  resetPreferences();
  syncSentryUserProfile();
  clearAllCredentials();
  autoConnectProviders(setCredential, getConnectedProviderIds);
  if (is.dev) {
    mainWindow?.webContents.reloadIgnoringCache();
  } else {
    app.relaunch();
    app.quit();
  }
});
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('app:setTitleBarOverlay', (_event, color: string, symbolColor: string) => {
  if (!mainWindow) return;
  if (process.platform === 'win32') {
    mainWindow.setTitleBarOverlay({ color, symbolColor, height: 40 });
  }
});
ipcMain.handle('feedback:captureScreenshot', () => captureFeedbackScreenshot(mainWindow));
ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('update:download', () => downloadUpdate());
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('update:getState', () => getUpdateState());

// Export IPC handlers
ipcMain.handle(
  'export:saveDialog',
  async (
    _event,
    options: {
      format: 'pdf' | 'png' | 'jpg';
      workspaceSlug: string;
      documentId: string;
      isZip: boolean;
    },
  ) => {
    if (!mainWindow) return null;
    const workspaceTitle = getWorkspaceEntry(options.workspaceSlug)?.title ?? options.workspaceSlug;
    const documentTitle = (await readDocumentConfig(options.workspaceSlug, options.documentId))
      .title;
    const ext = options.isZip ? 'zip' : options.format === 'pdf' ? 'pdf' : options.format;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: buildExportFileName(workspaceTitle, documentTitle, ext),
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
ipcMain.handle('workspace:list', () => listWorkspaces());

ipcMain.handle('workspace:create', async (_event, title: string, templateId?: string) => {
  const slug = await createNewWorkspace(
    title,
    templateId as Parameters<typeof createNewWorkspace>[1],
  );
  return slug;
});

ipcMain.handle('workspace:select', (_event, workspaceName: string) => {
  updateWorkspaceLastOpened(workspaceName);
});

ipcMain.handle('workspace:getDocumentCount', (_event, workspaceName: string) =>
  getDocumentCount(workspaceName),
);

// Document CRUD IPC handlers
ipcMain.handle('workspace:getDesignSystemDocId', (_event, ws: string) => getDesignSystemDocId(ws));
ipcMain.handle('workspace:getDesignSystemDocInfo', (_event, ws: string) =>
  getDesignSystemDocInfo(ws),
);
ipcMain.handle('document:list', (_event, ws: string) => listDocumentsFull(ws));
ipcMain.handle('document:read', (_event, ws: string, docId: string) =>
  readDocumentConfig(ws, docId),
);
ipcMain.handle(
  'document:create',
  (_event, ws: string, title: string, size: PageSizeName, folder?: string) =>
    createDocument(ws, title, size, folder),
);
ipcMain.handle('document:delete', (_event, ws: string, docId: string) => deleteDocument(ws, docId));
ipcMain.handle('document:rename', (_event, ws: string, docId: string, newTitle: string) =>
  renameDocument(ws, docId, newTitle),
);
ipcMain.handle('document:duplicate', (_event, ws: string, docId: string) =>
  duplicateDocument(ws, docId),
);
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

// Conversation persistence IPC handlers
ipcMain.handle('conversation:load', (_event, ws: string, docId: string) =>
  loadConversation(ws, docId),
);
ipcMain.handle(
  'conversation:save',
  (
    _event,
    ws: string,
    docId: string,
    messages: unknown,
    usage: { inputTokens: number; outputTokens: number },
  ) => saveConversation(ws, docId, messages as import('../shared/types').StoredMessage[], usage),
);
ipcMain.handle('conversation:clear', (_event, ws: string, docId: string) =>
  clearConversation(ws, docId),
);

// Snapshot IPC handlers
ipcMain.handle(
  'snapshot:create',
  (
    _event,
    ws: string,
    docId: string,
    userMessageId: string,
    messages: unknown,
    usage: { inputTokens: number; outputTokens: number },
  ) =>
    createSnapshot(
      ws,
      docId,
      userMessageId,
      messages as import('../shared/types').StoredMessage[],
      usage,
    ),
);
ipcMain.handle('snapshot:revert', (_event, ws: string, docId: string, userMessageId: string) =>
  revertToSnapshot(ws, docId, userMessageId),
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
ipcMain.handle('assets:listDocument', (_event, workspaceName: string, docId: string) =>
  listDocumentAssets(resolveWorkspacePath(workspaceName), docId),
);
ipcMain.handle(
  'assets:uploadDocument',
  (_event, workspaceName: string, docId: string, files: { name: string; data: Uint8Array }[]) =>
    uploadDocumentAssets(resolveWorkspacePath(workspaceName), docId, files),
);
ipcMain.handle(
  'assets:deleteDocument',
  (_event, workspaceName: string, docId: string, fileName: string) =>
    deleteDocumentAsset(resolveWorkspacePath(workspaceName), docId, fileName),
);
ipcMain.handle(
  'assets:renameDocument',
  (_event, workspaceName: string, docId: string, oldName: string, newName: string) =>
    renameDocumentAsset(resolveWorkspacePath(workspaceName), docId, oldName, newName),
);

// AI Provider Manager
registerAiProviderHandlers(ipcMain);

// Renderer
ipcMain.handle(
  'renderer:build',
  (_event, ws: string, doc: string, page: string, approach?: 'ssr' | 'csr', editMode?: boolean) =>
    buildPage(ws, doc, page, approach, editMode),
);
ipcMain.handle('renderer:export', (_event, options) => exportPage(options));
ipcMain.handle('template:buildPreviews', () => buildAllTemplatePreviews());

ipcMain.handle(
  'renderer:validateCss',
  async (_event, workspace: string): Promise<{ ok: true } | { ok: false; errors: string[] }> => {
    try {
      const css = await readStyles(workspace);
      const errors: string[] = [];

      if (!/@import\s+["']tailwindcss["']/.test(css)) {
        errors.push(
          'styles.css is missing `@import "tailwindcss";` — this import is required for Tailwind utilities to work. Add it as the first line.',
        );
      }

      const wsPath = resolveWorkspacePath(workspace);
      await compileTailwind(css, wsPath, []);

      return errors.length > 0 ? { ok: false, errors } : { ok: true };
    } catch (err) {
      const message = formatCssError(err, 'styles.css');
      return { ok: false, errors: [message] };
    }
  },
);

ipcMain.handle('shell:showItemInFolder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
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
  electronApp.setAppUserModelId('com.lithoapp.litho');

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

  if (process.platform === 'darwin') {
    app.dock?.setIcon(appIcon);
  }

  createWindow();
  if (mainWindow) {
    initAutoUpdater(mainWindow);
  }
  setTimeout(() => checkForUpdates(), 30_000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeAllDbs();
});
