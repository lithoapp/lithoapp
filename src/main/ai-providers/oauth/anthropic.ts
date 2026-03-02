import { shell } from 'electron';
import type { AuthMethod, Credential, CredentialOAuth } from '../types';
import { generatePKCE } from './pkce';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const ANTHROPIC_REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const ANTHROPIC_SCOPES = 'org:create_api_key user:profile user:inference';

export const ANTHROPIC_AUTH_METHODS: AuthMethod[] = [
  { type: 'oauth', id: 'anthropic-max', label: 'Claude Pro/Max' },
  { type: 'oauth', id: 'anthropic-console', label: 'Create an API Key (via OAuth)' },
  { type: 'api', label: 'API Key' },
];

// ---------------------------------------------------------------------------
// Token exchange & refresh
// ---------------------------------------------------------------------------

async function exchangeAnthropicCode(
  code: string,
  verifier: string,
): Promise<{ refresh_token: string; access_token: string; expires_in: number }> {
  const splits = code.split('#');
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: splits[0],
      state: splits[1],
      grant_type: 'authorization_code',
      client_id: ANTHROPIC_CLIENT_ID,
      redirect_uri: ANTHROPIC_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic token exchange failed: ${response.status}`);
  return response.json() as Promise<{
    refresh_token: string;
    access_token: string;
    expires_in: number;
  }>;
}

export async function refreshAnthropicToken(
  refreshToken: string,
): Promise<{ refresh_token: string; access_token: string; expires_in: number }> {
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: ANTHROPIC_CLIENT_ID,
    }),
  });
  if (!response.ok) throw new Error(`Anthropic token refresh failed: ${response.status}`);
  return response.json() as Promise<{
    refresh_token: string;
    access_token: string;
    expires_in: number;
  }>;
}

// ---------------------------------------------------------------------------
// OAuth flow entry points
// ---------------------------------------------------------------------------

export async function startAnthropicOAuth(
  mode: 'max' | 'console',
): Promise<{ url: string; verifier: string }> {
  const pkce = await generatePKCE();
  const host = mode === 'console' ? 'console.anthropic.com' : 'claude.ai';
  const url = new URL(`https://${host}/oauth/authorize`);
  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', ANTHROPIC_REDIRECT_URI);
  url.searchParams.set('scope', ANTHROPIC_SCOPES);
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', pkce.verifier);

  void shell.openExternal(url.toString());
  return { url: url.toString(), verifier: pkce.verifier };
}

export async function completeAnthropicOAuth(
  code: string,
  verifier: string,
  mode: 'max' | 'console',
  persistCredential: (providerId: string, cred: Credential) => void,
): Promise<{ success: boolean; error?: string }> {
  try {
    const tokens = await exchangeAnthropicCode(code, verifier);

    if (mode === 'console') {
      // Exchange OAuth tokens for a permanent API key
      const apiKeyResult = await fetch(
        'https://api.anthropic.com/api/oauth/claude_cli/create_api_key',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${tokens.access_token}`,
          },
        },
      );
      if (!apiKeyResult.ok) throw new Error(`API key creation failed: ${apiKeyResult.status}`);
      const { raw_key } = (await apiKeyResult.json()) as { raw_key: string };
      persistCredential('anthropic', { type: 'api', key: raw_key });
    } else {
      // Store OAuth tokens directly (Claude Pro/Max)
      persistCredential('anthropic', {
        type: 'oauth',
        refresh: tokens.refresh_token,
        access: tokens.access_token,
        expires: Date.now() + tokens.expires_in * 1000,
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Fetch wrapper for Anthropic OAuth
// ---------------------------------------------------------------------------

export function createAnthropicFetchWrapper(
  oauthCred: CredentialOAuth,
  onCredentialUpdate: (cred: CredentialOAuth) => void,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (requestInput: RequestInfo | URL, init?: RequestInit) => {
    // Refresh token if expired
    if (!oauthCred.access || oauthCred.expires < Date.now()) {
      const tokens = await refreshAnthropicToken(oauthCred.refresh);
      oauthCred.access = tokens.access_token;
      oauthCred.refresh = tokens.refresh_token;
      oauthCred.expires = Date.now() + tokens.expires_in * 1000;
      onCredentialUpdate(oauthCred);
    }

    // Build headers from init
    const requestHeaders = new Headers();
    if (requestInput instanceof Request) {
      requestInput.headers.forEach((value, key) => {
        requestHeaders.set(key, value);
      });
    }
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          requestHeaders.set(key, value);
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers as [string, string][]) {
          if (value !== undefined) requestHeaders.set(key, String(value));
        }
      } else {
        for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
          if (value !== undefined) requestHeaders.set(key, String(value));
        }
      }
    }

    // Merge anthropic-beta headers
    const incomingBeta = requestHeaders.get('anthropic-beta') || '';
    const incomingBetasList = incomingBeta
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);
    const requiredBetas = ['oauth-2025-04-20', 'interleaved-thinking-2025-05-14'];
    const mergedBetas = [...new Set([...requiredBetas, ...incomingBetasList])].join(',');

    requestHeaders.set('authorization', `Bearer ${oauthCred.access}`);
    requestHeaders.set('anthropic-beta', mergedBetas);
    requestHeaders.set('user-agent', 'claude-cli/2.1.2 (external, cli)');
    requestHeaders.delete('x-api-key');

    // Add ?beta=true to /v1/messages URL
    let finalInput: RequestInfo | URL = requestInput;
    let requestUrl: URL | null = null;
    try {
      if (typeof requestInput === 'string' || requestInput instanceof URL) {
        requestUrl = new URL(requestInput.toString());
      } else if (requestInput instanceof Request) {
        requestUrl = new URL(requestInput.url);
      }
    } catch {
      requestUrl = null;
    }

    if (
      requestUrl &&
      requestUrl.pathname === '/v1/messages' &&
      !requestUrl.searchParams.has('beta')
    ) {
      requestUrl.searchParams.set('beta', 'true');
      finalInput =
        requestInput instanceof Request
          ? new Request(requestUrl.toString(), requestInput)
          : requestUrl;
    }

    return globalThis.fetch(finalInput, {
      ...init,
      headers: requestHeaders,
    });
  };
}
