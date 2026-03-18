import type { BrowserWindow } from 'electron';

export async function captureFeedbackScreenshot(
  mainWindow: BrowserWindow | null,
): Promise<Uint8Array | null> {
  if (!mainWindow) {
    console.warn('[feedback] Cannot capture screenshot: main window unavailable');
    return null;
  }

  try {
    const image = await mainWindow.webContents.capturePage();
    return new Uint8Array(image.toPNG());
  } catch (error) {
    console.error('[feedback] Failed to capture screenshot', error);
    return null;
  }
}
