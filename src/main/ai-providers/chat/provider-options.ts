// ---------------------------------------------------------------------------
// Provider-specific streamText options
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: providerOptions accepts wide union
type ProviderOpts = Record<string, Record<string, any>>;

const ENABLE_PARALLEL_TOOL_CALLS = true;

export function buildProviderOptions(
  providerId: string,
  modelId: string,
  extra: Record<string, unknown> = {},
): ProviderOpts {
  const result: ProviderOpts = {};

  // OpenAI / Codex: store=false, promptCacheKey, configurable tool parallelism
  if (providerId === 'openai') {
    result.openai = {
      store: false,
      parallelToolCalls: ENABLE_PARALLEL_TOOL_CALLS,
      ...extra,
    };
  }

  if (providerId !== 'anthropic' && providerId !== 'openai') {
    result[providerId] = { parallel_tool_calls: ENABLE_PARALLEL_TOOL_CALLS };
  }

  // Google Gemini: enable thinking
  if (providerId === 'google' || modelId.includes('gemini')) {
    const thinkingConfig: Record<string, unknown> = { includeThoughts: true };
    if (modelId.includes('gemini-3')) {
      thinkingConfig.thinkingLevel = 'high';
    }
    result.google = { ...(result.google ?? {}), thinkingConfig };
  }

  // GPT-5 reasoning models: reasoningEffort + reasoningSummary
  if (providerId === 'openai' && modelId.includes('gpt-5')) {
    result.openai = {
      ...(result.openai ?? {}),
      reasoningEffort: 'medium',
      reasoningSummary: 'auto',
    };
  }

  // Anthropic: configurable tool parallelism
  if (providerId === 'anthropic') {
    result.anthropic = {
      ...result.anthropic,
      disableParallelToolUse: !ENABLE_PARALLEL_TOOL_CALLS,
    };
  }

  // OpenRouter: include usage
  if (providerId === 'openrouter') {
    result.openrouter = {
      ...(result.openrouter ?? {}),
      usage: { include: true },
    };
    if (modelId.includes('gemini-3')) {
      result.openrouter = {
        ...result.openrouter,
        reasoning: { effort: 'high' },
      };
    }
  }

  return result;
}
