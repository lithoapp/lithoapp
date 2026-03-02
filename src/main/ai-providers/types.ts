// ---------------------------------------------------------------------------
// Provider & Model types
// ---------------------------------------------------------------------------

export interface ModelsDevModel {
  id: string;
  name: string;
  family?: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_write?: number;
  };
  limit?: {
    context: number;
    input?: number;
    output: number;
  };
  modalities?: {
    input: string[];
    output: string[];
  };
  status?: string;
  options?: Record<string, unknown>;
  headers?: Record<string, string>;
  provider?: { npm?: string; api?: string };
}

export interface ModelsDevProvider {
  api?: string;
  name: string;
  env: string[];
  id: string;
  npm?: string;
  models: Record<string, ModelsDevModel>;
}

export type ModelsDevData = Record<string, ModelsDevProvider>;

export interface ProviderInfo {
  id: string;
  name: string;
  env: string[];
  npm?: string;
  api?: string;
  modelCount: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  family?: string;
  contextWindow?: number;
  maxOutput?: number;
  inputCost?: number;
  outputCost?: number;
  capabilities: string[];
}

// ---------------------------------------------------------------------------
// Credential types
// ---------------------------------------------------------------------------

export type CredentialApi = { type: 'api'; key: string };
export type CredentialOAuth = {
  type: 'oauth';
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
};
export type Credential = CredentialApi | CredentialOAuth;

// ---------------------------------------------------------------------------
// OAuth types
// ---------------------------------------------------------------------------

export interface AuthMethod {
  type: 'api' | 'oauth' | 'free';
  label: string;
  id?: string;
}

export interface PkceCodes {
  verifier: string;
  challenge: string;
}

export interface OAuthTokenResponse {
  id_token: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

// ---------------------------------------------------------------------------
// Ping types
// ---------------------------------------------------------------------------

export interface PingResult {
  text: string;
  reasoning: string;
  finishReason: string;
  modelId: string;
  latencyMs: number;
  error?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ---------------------------------------------------------------------------
// Chat params (IPC contract — ChatStreamEvent lives in chat/stream-events.ts)
// ---------------------------------------------------------------------------

import type { AgentContext, AgentId, StoredMessage } from '../../shared/types';

export interface ChatStartParams {
  providerId: string;
  modelId: string;
  system?: string;
  messages: StoredMessage[];
  maxOutputTokens?: number;
  agentId?: AgentId;
  agentContext?: AgentContext;
}
