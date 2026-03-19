import type {
  AssetEntry,
  DesignSystem,
  DocumentConfig,
  DocumentInfo,
  ExportProgress,
  ExportRequest,
  PageSize,
} from '../shared/types';
import type { PageBuildData, PageExportOptions, RendererResult } from '../shared/types';
import type { UpdateState } from '../shared/types';
import type { RevertResult, StoredMessage, WorkspaceInfo } from '../shared/types';

interface LithoAPI {
  preferences: {
    getUserProfile: () => Promise<{ name: string | null; email: string | null }>;
    setUserProfile: (name: string, email: string) => Promise<void>;
    getTheme: () => Promise<'dark' | 'light' | 'system'>;
    setTheme: (value: 'dark' | 'light' | 'system') => Promise<void>;
    reset: () => Promise<void>;
    onThemeChange: (callback: (value: 'dark' | 'light') => void) => () => void;
  };
  telemetry: {
    getEnabled: () => Promise<boolean>;
    setEnabled: (value: boolean) => Promise<void>;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
    setTitleBarOverlay: (color: string, symbolColor: string) => Promise<void>;
  };
  update: {
    check: () => Promise<void>;
    download: () => Promise<void>;
    install: () => Promise<void>;
    getState: () => Promise<UpdateState>;
    onStatus: (callback: (data: UpdateState) => void) => () => void;
  };
  export: {
    start: (request: ExportRequest) => Promise<void>;
    getProgress: () => Promise<ExportProgress>;
    saveDialog: (options: {
      format: 'pdf' | 'png' | 'jpg';
      workspaceSlug: string;
      documentId: string;
      isZip: boolean;
    }) => Promise<string | null>;
    onProgress: (callback: (data: ExportProgress) => void) => () => void;
  };
  workspace: {
    list: () => Promise<WorkspaceInfo[]>;
    create: (name: string, templateId?: string) => Promise<string>;
    select: (name: string) => Promise<void>;
    getDocumentCount: (name: string) => Promise<number>;
    getDesignSystemDocId: (name: string) => Promise<string | null>;
    getDesignSystemDocInfo: (name: string) => Promise<DocumentInfo | null>;
  };
  document: {
    list: (workspaceName: string) => Promise<DocumentInfo[]>;
    read: (workspaceName: string, docId: string) => Promise<DocumentConfig>;
    create: (
      workspaceName: string,
      title: string,
      size: string | PageSize,
      folder?: string,
    ) => Promise<string>;
    delete: (workspaceName: string, docId: string) => Promise<void>;
    rename: (workspaceName: string, docId: string, newTitle: string) => Promise<void>;
    duplicate: (workspaceName: string, docId: string) => Promise<string>;
    updateFolder: (workspaceName: string, docId: string, folder: string) => Promise<void>;
  };
  designSystem: {
    read: (workspaceName: string) => Promise<DesignSystem>;
    updateTokens: (
      workspaceName: string,
      updates: Array<{ variable: string; value: string }>,
    ) => Promise<void>;
  };
  renderer: {
    build: (
      workspace: string,
      document: string,
      page: string,
      approach?: 'ssr' | 'csr',
      editMode?: boolean,
    ) => Promise<RendererResult<PageBuildData>>;
    export: (options: PageExportOptions) => Promise<RendererResult<void>>;
    validateCss: (workspace: string) => Promise<{ ok: true } | { ok: false; errors: string[] }>;
  };
  template: {
    buildPreviews: () => Promise<Record<string, string>>;
  };
  aiProvider: {
    list: () => Promise<{
      providers: Array<{
        id: string;
        name: string;
        api?: string;
        modelCount: number;
        autoConnect: boolean;
        defaultModel: string;
        internalProvider?: string;
      }>;
      connected: string[];
      modelsDevLoaded: boolean;
      modelsDevError: string | null;
    }>;
    models: (providerId: string) => Promise<
      Array<{
        id: string;
        name: string;
        family?: string;
        contextWindow?: number;
        maxOutput?: number;
        inputCost?: number;
        outputCost?: number;
        capabilities: string[];
      }>
    >;
    authMethods: (
      providerId: string,
    ) => Promise<Array<{ type: 'api' | 'oauth' | 'free'; label: string; id?: string }>>;
    connectApiKey: (providerId: string, key: string) => Promise<void>;
    disconnect: (providerId: string) => Promise<void>;
    startOAuth: (
      providerId: string,
      mode?: string,
    ) => Promise<{ url: string; verifier?: string; method: 'auto' | 'code' }>;
    completeOAuth: (
      providerId: string,
      code?: string,
      verifier?: string,
      mode?: string,
    ) => Promise<{ success: boolean; error?: string }>;
    connectFree: (providerId: string) => Promise<void>;
    ping: (
      providerId: string,
      modelId: string,
    ) => Promise<{
      text: string;
      reasoning: string;
      finishReason: string;
      modelId: string;
      latencyMs: number;
      error?: string;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    }>;
    refreshModelsDev: () => Promise<{ loaded: boolean; error: string | null }>;
  };
  chat: {
    start: (params: {
      providerId: string;
      modelId: string;
      system?: string;
      messages: StoredMessage[];
      maxOutputTokens?: number;
      agentId: 'document' | 'design-system' | 'workspace';
      agentContext: {
        docId?: string;
        title?: string;
        width?: number;
        height?: number;
        unit?: string;
        userName?: string;
        fontContext?: string;
        assetsSummary?: string;
        designSystemDocId?: string | null;
        workspaceTitle?: string;
      };
      workspaceName: string;
    }) => Promise<{ chatId: string }>;
    abort: (chatId: string) => Promise<void>;
    onDelta: (
      callback: (
        chatId: string,
        data:
          | { type: 'text-delta'; text: string }
          | { type: 'reasoning-delta'; text: string }
          | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
          | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
          | { type: 'source'; source: unknown }
          | { type: 'error'; error: string }
          | {
              type: 'finish';
              finishReason: string;
              usage: {
                inputTokens: number;
                outputTokens: number;
                totalTokens: number;
                contextWindow?: number;
              };
              responseMessages: StoredMessage[];
            },
      ) => void,
    ) => () => void;
  };
  conversation: {
    load: (
      workspace: string,
      documentId: string,
    ) => Promise<{
      messages: StoredMessage[];
      usage: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        contextWindow?: number;
      };
    }>;
    save: (
      workspace: string,
      documentId: string,
      messages: StoredMessage[],
      usage: { inputTokens: number; outputTokens: number },
    ) => Promise<void>;
    clear: (workspace: string, documentId: string) => Promise<void>;
  };
  snapshot: {
    create: (
      workspace: string,
      documentId: string,
      userMessageId: string,
      messages: StoredMessage[],
      usage: { inputTokens: number; outputTokens: number },
    ) => Promise<void>;
    revert: (workspace: string, documentId: string, userMessageId: string) => Promise<RevertResult>;
    listMessageIds: (workspace: string, documentId: string) => Promise<string[]>;
  };
  shell: {
    showItemInFolder: (filePath: string) => Promise<void>;
  };
  feedback: {
    captureScreenshot: () => Promise<Uint8Array | null>;
  };
  assets: {
    list: (workspaceName: string, dirPath: string, recursive?: boolean) => Promise<AssetEntry[]>;
    upload: (
      workspaceName: string,
      dirPath: string,
      files: { name: string; data: Uint8Array }[],
    ) => Promise<void>;
    createDirectory: (workspaceName: string, dirPath: string) => Promise<void>;
    delete: (workspaceName: string, entryPath: string) => Promise<void>;
    rename: (workspaceName: string, oldPath: string, newPath: string) => Promise<void>;
    listDocument: (workspaceName: string, docId: string) => Promise<AssetEntry[]>;
    uploadDocument: (
      workspaceName: string,
      docId: string,
      files: { name: string; data: Uint8Array }[],
    ) => Promise<void>;
    deleteDocument: (workspaceName: string, docId: string, fileName: string) => Promise<void>;
    renameDocument: (
      workspaceName: string,
      docId: string,
      oldName: string,
      newName: string,
    ) => Promise<void>;
  };
}

declare global {
  interface Window {
    litho: LithoAPI;
  }
}
