import {
  getConnectedProviderIds,
  setCredential,
} from '../../ai-providers/providers/credential-store';
import { filterModelsForProvider } from '../../ai-providers/providers/model-filters';
import { getProviderList, getProviderModels } from '../../ai-providers/providers/models-cache';
import type { Credential } from '../../ai-providers/types';

export interface SetCredentialParams {
  providerId: string;
  credential: Credential;
}

export async function handleProviderSetCredential(
  params: SetCredentialParams,
): Promise<Record<string, never>> {
  setCredential(params.providerId, params.credential);
  return {};
}

export async function handleProviderList(): Promise<{
  providers: unknown[];
  connected: string[];
}> {
  return {
    providers: getProviderList(),
    connected: getConnectedProviderIds(),
  };
}

export async function handleProviderListModels(params: {
  providerId: string;
}): Promise<{ models: unknown[] }> {
  const models = filterModelsForProvider(params.providerId, getProviderModels(params.providerId));
  return { models };
}
