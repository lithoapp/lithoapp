import type { CredentialOAuth } from "../types";
import {
  CODEX_API_ENDPOINT,
  extractAccountId,
  refreshOpenAIToken,
} from "./openai-flow";

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
        init.headers.delete("authorization");
        init.headers.delete("Authorization");
      } else if (Array.isArray(init.headers)) {
        init.headers = init.headers.filter(
          ([key]: [string, string]) => key.toLowerCase() !== "authorization",
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
        for (const [key, value] of Object.entries(
          init.headers as Record<string, string>,
        )) {
          if (value !== undefined) headers.set(key, String(value));
        }
      }
    }

    headers.set("authorization", `Bearer ${oauthCred.access}`);
    if (!headers.has("originator")) {
      headers.set("originator", "opencode");
    }
    if (!headers.has("User-Agent")) {
      headers.set(
        "User-Agent",
        `opencode/litho (${process.platform} ${process.arch})`,
      );
    }
    if (oauthCred.accountId) {
      headers.set("ChatGPT-Account-Id", oauthCred.accountId);
    }

    // Rewrite URL to Codex endpoint
    const parsed =
      requestInput instanceof URL
        ? requestInput
        : new URL(
            typeof requestInput === "string"
              ? requestInput
              : (requestInput as Request).url,
          );
    const url =
      parsed.pathname.includes("/v1/responses") ||
      parsed.pathname.includes("/chat/completions")
        ? new URL(CODEX_API_ENDPOINT)
        : parsed;

    return globalThis.fetch(url, { ...init, headers });
  };
}
