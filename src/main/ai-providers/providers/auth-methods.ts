import type { AuthMethod } from '../types';
import { getOAuthConfig, getProviderInfo } from './models-cache';

export function getAuthMethods(providerId: string): AuthMethod[] {
  const oauthConfig = getOAuthConfig(providerId);

  if (providerId === 'anthropic') {
    return [{ type: 'api', label: 'API Key' }];
  }

  if (providerId === 'openai') {
    return [
      {
        type: 'oauth',
        label: 'ChatGPT Pro/Plus (browser)',
        ...(oauthConfig && { oauth: oauthConfig }),
      },
      { type: 'api', label: 'API Key' },
    ];
  }

  const info = getProviderInfo(providerId);
  if (info) {
    return info.authMethods.map((method): AuthMethod => {
      if (method.type === 'api_key') return { type: 'api', label: method.name };
      return { type: 'oauth', label: method.name, id: method.type, oauth: method.oauth };
    });
  }

  return [{ type: 'api', label: 'API Key' }];
}

export function getOAuthClientId(providerId: string): string | undefined {
  return getOAuthConfig(providerId)?.clientId;
}
