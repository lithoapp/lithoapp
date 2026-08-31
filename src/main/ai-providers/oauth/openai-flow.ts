import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { shell } from 'electron';
import type { CredentialOAuth, OAuthTokenResponse, PkceCodes } from '../types';
import { CODEX_ORIGINATOR } from './client-identity';
import { generatePKCE, generateState } from './pkce';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_ISSUER = 'https://auth.openai.com';
const OAUTH_PORT = 1455;

export const CODEX_API_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
export const CODEX_DEFAULT_MODEL = 'gpt-5.6-sol';
export const OAUTH_DUMMY_KEY = 'litho-oauth-dummy-key';

// ---------------------------------------------------------------------------
// HTML templates
// ---------------------------------------------------------------------------

const HTML_SUCCESS = `<!doctype html>
<html><head><title>Litho - Authorization Successful</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#131010;color:#f1ecec}.container{text-align:center;padding:2rem}h1{margin-bottom:1rem}p{color:#b7b1b1}</style>
</head><body><div class="container"><h1>Authorization Successful</h1><p>You can close this window and return to Litho.</p></div>
<script>setTimeout(()=>window.close(),2000)</script></body></html>`;

const HTML_ERROR = (error: string): string => `<!doctype html>
<html><head><title>Litho - Authorization Failed</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#131010;color:#f1ecec}.container{text-align:center;padding:2rem}h1{color:#fc533a;margin-bottom:1rem}p{color:#b7b1b1}.error{color:#ff917b;font-family:monospace;margin-top:1rem;padding:1rem;background:#3c140d;border-radius:0.5rem}</style>
</head><body><div class="container"><h1>Authorization Failed</h1><p>An error occurred during authorization.</p><div class="error">${error}</div></div></body></html>`;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

interface PendingOAuth {
  pkce: PkceCodes;
  state: string;
  clientId: string;
  resolve: (tokens: OAuthTokenResponse) => void;
  reject: (error: Error) => void;
}

let oauthServer: Server | null = null;
let pendingOAuth: PendingOAuth | null = null;

// ---------------------------------------------------------------------------
// Token exchange & refresh
// ---------------------------------------------------------------------------

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  pkce: PkceCodes,
  clientId: string,
): Promise<OAuthTokenResponse> {
  const response = await fetch(`${OPENAI_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: pkce.verifier,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  return response.json() as Promise<OAuthTokenResponse>;
}

export async function refreshOpenAIToken(
  refreshToken: string,
  clientId: string,
): Promise<OAuthTokenResponse> {
  const response = await fetch(`${OPENAI_ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  });
  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);
  return response.json() as Promise<OAuthTokenResponse>;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function parseJwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return undefined;
  }
}

function extractAccountIdFromClaims(claims: Record<string, unknown>): string | undefined {
  return (
    (claims as { chatgpt_account_id?: string }).chatgpt_account_id ||
    (
      claims as {
        'https://api.openai.com/auth'?: { chatgpt_account_id?: string };
      }
    )['https://api.openai.com/auth']?.chatgpt_account_id ||
    (claims as { organizations?: Array<{ id: string }> }).organizations?.[0]?.id
  );
}

export function extractAccountId(tokens: OAuthTokenResponse): string | undefined {
  if (tokens.id_token) {
    const claims = parseJwtClaims(tokens.id_token);
    const accountId = claims && extractAccountIdFromClaims(claims);
    if (accountId) return accountId;
  }
  if (tokens.access_token) {
    const claims = parseJwtClaims(tokens.access_token);
    return claims ? extractAccountIdFromClaims(claims) : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Local OAuth server
// ---------------------------------------------------------------------------

function startOAuthServer(): Promise<{ port: number; redirectUri: string }> {
  if (oauthServer) {
    return Promise.resolve({
      port: OAUTH_PORT,
      redirectUri: `http://localhost:${OAUTH_PORT}/auth/callback`,
    });
  }

  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', `http://localhost:${OAUTH_PORT}`);

      if (url.pathname !== '/auth/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        const msg = errorDescription || error;
        pendingOAuth?.reject(new Error(msg));
        pendingOAuth = null;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(HTML_ERROR(msg));
        return;
      }

      if (!code) {
        const msg = 'Missing authorization code';
        pendingOAuth?.reject(new Error(msg));
        pendingOAuth = null;
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(HTML_ERROR(msg));
        return;
      }

      if (!pendingOAuth || state !== pendingOAuth.state) {
        const msg = 'Invalid state - potential CSRF attack';
        pendingOAuth?.reject(new Error(msg));
        pendingOAuth = null;
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(HTML_ERROR(msg));
        return;
      }

      const current = pendingOAuth;
      pendingOAuth = null;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(HTML_SUCCESS);

      const redirectUri = `http://localhost:${OAUTH_PORT}/auth/callback`;
      exchangeCodeForTokens(code, redirectUri, current.pkce, current.clientId)
        .then((tokens) => current.resolve(tokens))
        .catch((err) => current.reject(err instanceof Error ? err : new Error(String(err))));
    });

    server.on('error', reject);
    server.listen(OAUTH_PORT, '127.0.0.1', () => {
      oauthServer = server;
      resolve({
        port: OAUTH_PORT,
        redirectUri: `http://localhost:${OAUTH_PORT}/auth/callback`,
      });
    });
  });
}

export function stopOpenAIOAuthServer(): void {
  if (oauthServer) {
    oauthServer.close();
    oauthServer = null;
  }
}

// ---------------------------------------------------------------------------
// OAuth flow entry points
// ---------------------------------------------------------------------------

export async function startOpenAIOAuth(
  persistCredential: (providerId: string, cred: CredentialOAuth) => void,
  clientId: string,
): Promise<{ url: string }> {
  const { redirectUri } = await startOAuthServer();
  const pkce = await generatePKCE();
  const state = generateState();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: CODEX_ORIGINATOR,
  });

  const url = `${OPENAI_ISSUER}/oauth/authorize?${params.toString()}`;
  void shell.openExternal(url);

  const callbackPromise = new Promise<OAuthTokenResponse>((resolve, reject) => {
    const timeout = setTimeout(
      () => {
        if (pendingOAuth) {
          pendingOAuth = null;
          reject(new Error('OAuth callback timeout - authorization took too long'));
        }
      },
      5 * 60 * 1000,
    );

    pendingOAuth = {
      pkce,
      state,
      clientId,
      resolve: (tokens) => {
        clearTimeout(timeout);
        resolve(tokens);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    };
  });

  void callbackPromise
    .then((tokens) => {
      stopOpenAIOAuthServer();
      const accountId = extractAccountId(tokens);
      persistCredential('openai', {
        type: 'oauth',
        refresh: tokens.refresh_token,
        access: tokens.access_token,
        expires: Date.now() + (tokens.expires_in ?? 3600) * 1000,
        ...(accountId && { accountId }),
      });
    })
    .catch(() => {
      stopOpenAIOAuthServer();
    });

  return { url };
}

export async function completeOpenAIOAuth(
  getCredential: (providerId: string) => unknown,
): Promise<{ success: boolean; error?: string }> {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const cred = getCredential('openai') as { type?: string } | undefined;
    if (cred?.type === 'oauth') return { success: true };
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { success: false, error: 'OAuth flow timed out' };
}
