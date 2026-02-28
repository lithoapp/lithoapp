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
import type { OpencodeInfo } from '../shared/types';
import type { UpdateState } from '../shared/types';
import type { WorkspaceInfo, WorkspaceState } from '../shared/types';

interface LithoAPI {
  preferences: {
    getUserProfile: () => Promise<{ name: string | null; email: string | null }>;
    setUserProfile: (name: string, email: string) => Promise<void>;
    getTheme: () => Promise<'dark' | 'light' | 'system'>;
    setTheme: (value: 'dark' | 'light' | 'system') => Promise<void>;
    onThemeChange: (callback: (value: 'dark' | 'light') => void) => () => void;
  };
  telemetry: {
    getEnabled: () => Promise<boolean>;
    setEnabled: (value: boolean) => Promise<void>;
  };
  advancedTools: {
    getEnabled: () => Promise<boolean>;
    setEnabled: (value: boolean) => Promise<void>;
    exportSource: () => Promise<{ success: boolean; path?: string; error?: string }>;
  };
  opencode: {
    getStatus: () => Promise<OpencodeInfo>;
    start: () => Promise<void>;
    restart: () => Promise<void>;
    stop: () => Promise<void>;
    onStatusChange: (callback: (data: OpencodeInfo) => void) => () => void;
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
      format: string;
      title: string;
      isZip: boolean;
    }) => Promise<string | null>;
    onProgress: (callback: (data: ExportProgress) => void) => () => void;
  };
  workspace: {
    list: () => Promise<WorkspaceInfo[]>;
    getActive: () => Promise<WorkspaceState>;
    create: (name: string) => Promise<string>;
    select: (name: string) => Promise<void>;
    stop: () => Promise<void>;
    getDocumentCount: (name: string) => Promise<number>;
    getDesignSystemDocId: (name: string) => Promise<string | null>;
    getDesignSystemDocInfo: (name: string) => Promise<DocumentInfo | null>;
    onChanged: (callback: (data: WorkspaceState) => void) => () => void;
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
    ) => Promise<RendererResult<PageBuildData>>;
    export: (options: PageExportOptions) => Promise<RendererResult<void>>;
    validateCss: (workspace: string) => Promise<{ ok: true } | { ok: false; errors: string[] }>;
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
  };
}

declare global {
  interface Window {
    litho: LithoAPI;
  }
}
