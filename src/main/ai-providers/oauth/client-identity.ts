import { app } from 'electron';

// Identity the ChatGPT Codex backend sees. Must stay consistent with the
// originator sent on the OAuth authorize request.
//
// The client ID used for this OAuth flow (see litho-models' curated
// providers) is OpenAI's own published Codex CLI client ID, a public PKCE
// client with no secret — reused here the same way other third-party Codex
// integrations do, but under Litho's own originator/User-Agent rather than
// impersonating OpenAI's CLI.
export const CODEX_ORIGINATOR = 'litho';

export function codexUserAgent(): string {
  return `litho/${app.getVersion()} (${process.platform} ${process.arch})`;
}
