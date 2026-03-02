import { ANTHROPIC_AUTH_METHODS } from '../oauth/anthropic';
import { OPENAI_AUTH_METHODS } from '../oauth/openai-flow';
import type { AuthMethod } from '../types';

export function getAuthMethods(providerId: string): AuthMethod[] {
  if (providerId === 'openai') return OPENAI_AUTH_METHODS;
  if (providerId === 'anthropic') return ANTHROPIC_AUTH_METHODS;
  if (providerId === 'opencode') {
    return [
      { type: 'free', label: 'Free models (no key needed)' },
      { type: 'api', label: 'API Key' },
    ];
  }
  return [{ type: 'api', label: 'API Key' }];
}
