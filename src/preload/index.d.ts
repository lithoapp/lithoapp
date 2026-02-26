import type { AssetEntry, DocumentSnapshot, ExportProgress, ExportRequest } from '../shared/types';
import type {
  DocumentConfig,
  PageBuildData,
  PageExportOptions,
  RendererResult,
} from '../shared/types';
import type { OpencodeInfo } from '../shared/types';
import type { UpdateState } from '../shared/types';
import type { WorkspaceError, WorkspaceInfo, WorkspaceServerInfo } from '../shared/types';

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
    getActive: () => Promise<WorkspaceServerInfo>;
    create: (name: string) => Promise<string>;
    select: (name: string) => Promise<void>;
    stop: () => Promise<void>;
    getDocumentCount: (name: string) => Promise<number>;
    invalidateManifest: () => Promise<void>;
    onStatusChange: (callback: (data: WorkspaceServerInfo) => void) => () => void;
    onError: (callback: (data: WorkspaceError) => void) => () => void;
  };
  snapshot: {
    readDocumentFiles: (workspaceName: string, slug: string) => Promise<Record<string, string>>;
    createDocument: (
      workspaceName: string,
      slug: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ) => Promise<string>;
    restoreDocument: (workspaceName: string, slug: string, snapshotId: string) => Promise<void>;
    listDocument: (workspaceName: string, slug: string) => Promise<DocumentSnapshot[]>;
    deleteDocument: (workspaceName: string, slug: string, snapshotId: string) => Promise<void>;

    readStylesFile: (workspaceName: string) => Promise<Record<string, string>>;
    createStyles: (
      workspaceName: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ) => Promise<string>;
    restoreStyles: (workspaceName: string, snapshotId: string) => Promise<void>;
    listStyles: (workspaceName: string) => Promise<DocumentSnapshot[]>;
    deleteStyles: (workspaceName: string, snapshotId: string) => Promise<void>;
  };
  renderer: {
    build: (
      workspace: string,
      document: string,
      page: string,
      approach?: 'ssr' | 'csr',
    ) => Promise<RendererResult<PageBuildData>>;
    listWorkspaces: () => Promise<RendererResult<string[]>>;
    listDocuments: (workspace: string) => Promise<RendererResult<string[]>>;
    listPages: (workspace: string, document: string) => Promise<RendererResult<string[]>>;
    readDocumentConfig: (
      workspace: string,
      document: string,
    ) => Promise<RendererResult<DocumentConfig>>;
    export: (options: PageExportOptions) => Promise<RendererResult<void>>;
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
