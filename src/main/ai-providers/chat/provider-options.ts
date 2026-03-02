// ---------------------------------------------------------------------------
// Provider-specific options — matches OpenCode's ProviderTransform.options()
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: providerOptions accepts wide union
type ProviderOpts = Record<string, Record<string, any>>;

export function buildProviderOptions(
  providerId: string,
  modelId: string,
  extra: Record<string, unknown> = {},
): ProviderOpts {
  const result: ProviderOpts = {};

  // OpenAI / Codex: store=false, promptCacheKey
  if (providerId === "openai") {
    result.openai = { store: false, ...extra };
  }

  // Google Gemini: enable thinking
  if (providerId === "google" || modelId.includes("gemini")) {
    const thinkingConfig: Record<string, unknown> = { includeThoughts: true };
    if (modelId.includes("gemini-3")) {
      thinkingConfig.thinkingLevel = "high";
    }
    result.google = { thinkingConfig };
  }

  // GPT-5 reasoning models: reasoningEffort + reasoningSummary
  if (providerId === "openai" && modelId.includes("gpt-5")) {
    result.openai = {
      ...(result.openai ?? {}),
      reasoningEffort: "medium",
      reasoningSummary: "auto",
    };
  }

  // OpenRouter: include usage
  if (providerId === "openrouter") {
    result.openrouter = { usage: { include: true } };
    if (modelId.includes("gemini-3")) {
      result.openrouter.reasoning = { effort: "high" };
    }
  }

  return result;
}
