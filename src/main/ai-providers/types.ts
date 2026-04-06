// ---------------------------------------------------------------------------
// Provider & Model types
// ---------------------------------------------------------------------------

export interface LithoModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  capabilities: string[];
  authSupport?: string[];
  cost?: { input: number; output: number };
  openWeights?: boolean;
  releaseDate?: string;
}

export interface OAuthConfig {
  clientId: string;
}

export interface LithoApiAuthMethod {
  type: string;
  name: string;
  description: string;
  oauth?: OAuthConfig;
}

export interface LithoProvider {
  id: string;
  name: string;
  description: string;
  autoConnect: boolean;
  defaultModel: string;
  authMethods: LithoApiAuthMethod[];
  internalProvider?: string;
  baseUrl?: string;
  models: Record<string, LithoModel>;
}

export interface LithoModelsData {
  version: string;
  generatedAt: string;
  providers: Record<string, LithoProvider>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  api?: string;
  modelCount: number;
  autoConnect: boolean;
  defaultModel: string;
  internalProvider?: string;
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
  authSupport?: string[];
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
  oauth?: OAuthConfig;
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
  agentId: AgentId;
  agentContext: AgentContext;
  workspaceName: string;
  /**
   * Pre-rendered kickoff prompt. The in-app renderer passes the kickoff
   * as a regular user message (so it doesn't set this). The headless
   * dispatcher renders the kickoff template itself and passes it here
   * so that `run-start` can report exactly what the agent saw.
   */
  kickoffMessage?: string;
  /**
   * Primary user message string for the run (used for `run-start` metadata
   * in headless mode). For the in-app renderer this is derived from
   * `messages` and left undefined here.
   */
  userMessage?: string;
}
