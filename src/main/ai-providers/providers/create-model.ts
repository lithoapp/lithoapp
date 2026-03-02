import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { createSseFilterFetch } from "../lib/sse-filter";
import { createAnthropicFetchWrapper } from "../oauth/anthropic";
import { createOpenAIFetchWrapper } from "../oauth/openai-fetch";
import { CODEX_DEFAULT_MODEL, OAUTH_DUMMY_KEY } from "../oauth/openai-flow";
import type { CredentialApi, CredentialOAuth } from "../types";
import { getCredential, setCredential } from "./credential-store";
import { getModelsDevCache } from "./models-cache";

// ---------------------------------------------------------------------------
// Max output token cap — matches OpenCode's ProviderTransform.OUTPUT_TOKEN_MAX
// ---------------------------------------------------------------------------

const OUTPUT_TOKEN_MAX = 32_000;

// ---------------------------------------------------------------------------
// Model construction — shared between ping and chat
// ---------------------------------------------------------------------------

export function createModel(
  providerId: string,
  modelId: string,
): LanguageModel {
  const cred = getCredential(providerId);
  if (!cred)
    throw new Error(`No credentials found for provider: ${providerId}`);

  const providerData = getModelsDevCache()?.[providerId];

  if (providerId === "openai" && cred.type === "oauth") {
    const wrapper = createOpenAIFetchWrapper(cred, (c) =>
      setCredential("openai", c),
    );
    const provider = createOpenAI({ apiKey: OAUTH_DUMMY_KEY, fetch: wrapper });
    const fallback = CODEX_DEFAULT_MODEL;
    const selected = modelId || fallback;
    return provider.responses(selected);
  }

  if (providerId === "openai") {
    const provider = createOpenAI({ apiKey: (cred as CredentialApi).key });
    return provider.responses(modelId);
  }

  if (providerId === "anthropic" && cred.type === "oauth") {
    const wrapper = createAnthropicFetchWrapper(cred as CredentialOAuth, (c) =>
      setCredential("anthropic", c),
    );
    const provider = createAnthropic({
      apiKey: "oauth-placeholder",
      fetch: wrapper,
    });
    return provider(modelId);
  }

  if (providerId === "anthropic") {
    const provider = createAnthropic({
      apiKey: (cred as CredentialApi).key,
    });
    return provider(modelId);
  }

  const baseURL = providerData?.api ?? `https://api.${providerId}.com/v1`;
  const provider = createOpenAICompatible({
    name: providerId,
    baseURL,
    apiKey: (cred as CredentialApi).key,
    fetch: createSseFilterFetch(),
  });
  return provider(modelId);
}

export { OUTPUT_TOKEN_MAX };
