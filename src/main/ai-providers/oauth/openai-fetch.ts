import type { CredentialOAuth } from '../types';
import { CODEX_API_ENDPOINT, extractAccountId, refreshOpenAIToken } from './openai-flow';

// ---------------------------------------------------------------------------
// Fetch wrapper for Codex API (URL rewriting, body patching, token refresh)
// ---------------------------------------------------------------------------

export function createOpenAIFetchWrapper(
  oauthCred: CredentialOAuth,
  onCredentialUpdate: (cred: CredentialOAuth) => void,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (requestInput: RequestInfo | URL, init?: RequestInit) => {
    // Remove dummy API key authorization header
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.delete('authorization');
        init.headers.delete('Authorization');
      } else if (Array.isArray(init.headers)) {
        init.headers = init.headers.filter(
          ([key]: [string, string]) => key.toLowerCase() !== 'authorization',
        );
      } else {
        const h = init.headers as Record<string, string>;
        delete h.authorization;
        delete h.Authorization;
      }
    }

    // Refresh token if expired
    if (!oauthCred.access || oauthCred.expires < Date.now()) {
      const tokens = await refreshOpenAIToken(oauthCred.refresh);
      const newAccountId = extractAccountId(tokens) || oauthCred.accountId;
      oauthCred.access = tokens.access_token;
      oauthCred.expires = Date.now() + (tokens.expires_in ?? 3600) * 1000;
      if (newAccountId) oauthCred.accountId = newAccountId;
      onCredentialUpdate(oauthCred);
    }

    // Build headers
    const headers = new Headers();
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers.set(key, value);
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers as [string, string][]) {
          if (value !== undefined) headers.set(key, String(value));
        }
      } else {
        for (const [key, value] of Object.entries(init.headers as Record<string, string>)) {
          if (value !== undefined) headers.set(key, String(value));
        }
      }
    }

    headers.set('authorization', `Bearer ${oauthCred.access}`);
    headers.set('originator', 'litho');
    if (oauthCred.accountId) {
      headers.set('ChatGPT-Account-Id', oauthCred.accountId);
    }

    // Rewrite URL to Codex endpoint
    const parsed =
      requestInput instanceof URL
        ? requestInput
        : new URL(typeof requestInput === 'string' ? requestInput : (requestInput as Request).url);
    const url =
      parsed.pathname.includes('/v1/responses') || parsed.pathname.includes('/chat/completions')
        ? new URL(CODEX_API_ENDPOINT)
        : parsed;

    // Patch request body for Codex endpoint requirements
    let body = init?.body;
    if (typeof body === 'string' && init?.method === 'POST') {
      try {
        const bodyObj = JSON.parse(body);

        // Extract system/developer message from input array → instructions field
        // ai-sdk sends system as role:"developer" for reasoning models (gpt-5.x)
        if (!bodyObj.instructions && Array.isArray(bodyObj.input)) {
          const sysIdx = bodyObj.input.findIndex(
            (m: { role?: string }) => m.role === 'system' || m.role === 'developer',
          );
          if (sysIdx !== -1) {
            const sysMsg = bodyObj.input[sysIdx];
            bodyObj.instructions =
              typeof sysMsg.content === 'string' ? sysMsg.content : JSON.stringify(sysMsg.content);
            bodyObj.input.splice(sysIdx, 1);
          }
        }

        bodyObj.store = false;
        delete bodyObj.max_output_tokens;

        // Let the Codex endpoint decide tool_choice — explicit "auto" may behave differently
        if (bodyObj.tool_choice === 'auto') {
          delete bodyObj.tool_choice;
        }

        // Strip item IDs from input (Codex requires this when store=false)
        if (Array.isArray(bodyObj.input)) {
          for (const item of bodyObj.input) {
            if ('id' in item) {
              delete item.id;
            }
          }
        }

        console.log(
          `  [codex-fetch] ${bodyObj.model} | input=${Array.isArray(bodyObj.input) ? bodyObj.input.length : '?'} items`,
        );

        body = JSON.stringify(bodyObj);
      } catch {
        // not JSON, leave as-is
      }
    }

    return globalThis.fetch(url, { ...init, body, headers });
  };
}
