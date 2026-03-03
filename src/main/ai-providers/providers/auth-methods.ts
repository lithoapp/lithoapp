import { ANTHROPIC_AUTH_METHODS } from '../oauth/anthropic';
import { OPENAI_AUTH_METHODS } from '../oauth/openai-flow';
import type { AuthMethod } from '../types';
import { getProviderInfo } from './models-cache';

export function getAuthMethods(providerId: string): AuthMethod[] {
  if (providerId === 'openai') return OPENAI_AUTH_METHODS;
  if (providerId === 'anthropic') return ANTHROPIC_AUTH_METHODS;

  const info = getProviderInfo(providerId);
  if (info) {
    return info.authMethods.map((method): AuthMethod => {
      if (method.type === 'api_key') return { type: 'api', label: method.name };
      if (method.type === 'free') return { type: 'free', label: method.name };
      return { type: 'oauth', label: method.name, id: method.type };
    });
  }

  return [{ type: 'api', label: 'API Key' }];
}
