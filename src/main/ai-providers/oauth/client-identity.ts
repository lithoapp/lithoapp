import { app } from 'electron';

// Identity the ChatGPT Codex backend sees. Must stay consistent with the
// originator sent on the OAuth authorize request.
export const CODEX_ORIGINATOR = 'litho';

export function codexUserAgent(): string {
  return `litho/${app.getVersion()} (${process.platform} ${process.arch})`;
}
