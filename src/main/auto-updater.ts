import { is } from '@electron-toolkit/utils';
import type { BrowserWindow } from 'electron';
import pkg from 'electron-updater';
import type { UpdateState, UpdateStatus } from '../shared/types';

export type { UpdateState, UpdateStatus };

const { autoUpdater } = pkg;

let state: UpdateState = { status: 'idle' };
let mainWindow: BrowserWindow | null = null;

function setState(next: UpdateState): void {
  state = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:status', state);
  }
}

export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.requestHeaders = {
    'x-api-key': '89b48001c49d7e61788d6945bd577fd1eacd5739dcb74f6e355ea419eca842bf',
  };

  if (is.dev) {
    autoUpdater.forceDevUpdateConfig = true;
  }

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    setState({ status: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    setState({ status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    setState({ status: 'downloading', progress: { percent: progress.percent } });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    if (err.message?.includes('No published versions') || err.message?.includes('latest version')) {
      console.log('[updater] No releases found, treating as not-available');
      setState({ status: 'not-available' });
    } else {
      console.error('[updater] Update error:', err.message);
      setState({ status: 'error', error: err.message });
    }
  });
}

export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[updater] checkForUpdates failed:', err.message);
    setState({ status: 'error', error: err.message });
  });
}

export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err) => {
    console.error('[updater] downloadUpdate failed:', err.message);
    setState({ status: 'error', error: err.message });
  });
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true);
}

export function getUpdateState(): UpdateState {
  return state;
}
