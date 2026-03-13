import {
  Anthropic,
  Azure,
  Bedrock,
  Cohere,
  DeepSeek,
  Fireworks,
  Github,
  Google,
  Groq,
  Mistral,
  OpenAI,
  OpenCode,
  OpenRouter,
  Perplexity,
  Together,
  Zhipu,
} from '@lobehub/icons';

type IconComponent = React.ComponentType<{ size?: number }>;

const providerIcons: Record<string, IconComponent> = {
  anthropic: Anthropic,
  openai: OpenAI,
  google: Google.Color,
  free: OpenCode,
  openrouter: OpenRouter,
  mistral: Mistral.Color,
  deepseek: DeepSeek.Color,
  cohere: Cohere.Color,
  perplexity: Perplexity.Color,
  groq: Groq,
  together: Together.Color,
  fireworks: Fireworks.Color,
  'github-copilot': Github,
  bedrock: Bedrock.Color,
  azure: Azure.Color,
  'zai-coding-plan': Zhipu.Color,
};

/**
 * Renders an AI provider icon using @lobehub/icons.
 * Falls back to a colored initial circle for unknown providers.
 */
export function AiProviderIcon({
  providerId,
  size = 28,
}: {
  providerId: string;
  size?: number;
}): React.JSX.Element {
  const Icon = providerIcons[providerId];

  if (!Icon) {
    return <FallbackIcon providerId={providerId} size={size} />;
  }

  return <Icon size={size} />;
}

function FallbackIcon({
  providerId,
  size,
}: {
  providerId: string;
  size: number;
}): React.JSX.Element {
  const initial = providerId.charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}
