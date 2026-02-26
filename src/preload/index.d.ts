import type { AssetEntry, DocumentSnapshot, ExportProgress, ExportRequest } from '../shared/types';
import type { OpencodeInfo } from '../shared/types';
import type { UpdateState } from '../shared/types';
import type { WorkspaceEntry } from '../shared/types';
import type { WorkspaceError, WorkspaceServerInfo } from '../shared/types';

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
    list: () => Promise<WorkspaceEntry[]>;
    getActive: () => Promise<WorkspaceServerInfo>;
    create: (parentDir: string, name: string) => Promise<string>;
    open: () => Promise<string | null>;
    select: (path: string) => Promise<void>;
    remove: (path: string) => Promise<void>;
    stop: () => Promise<void>;
    chooseDirectory: () => Promise<string | null>;
    getDefaultLocation: () => Promise<string>;
    getDocumentCount: (path: string) => Promise<number>;
    onStatusChange: (callback: (data: WorkspaceServerInfo) => void) => () => void;
    onError: (callback: (data: WorkspaceError) => void) => () => void;
  };
  snapshot: {
    readDocumentFiles: (workspacePath: string, slug: string) => Promise<Record<string, string>>;
    createDocument: (
      workspacePath: string,
      slug: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ) => Promise<string>;
    restoreDocument: (workspacePath: string, slug: string, snapshotId: string) => Promise<void>;
    listDocument: (workspacePath: string, slug: string) => Promise<DocumentSnapshot[]>;
    deleteDocument: (workspacePath: string, slug: string, snapshotId: string) => Promise<void>;

    readStylesFile: (workspacePath: string) => Promise<Record<string, string>>;
    createStyles: (
      workspacePath: string,
      files: Record<string, string>,
      promptExcerpt: string,
      assistantMessageId: string,
    ) => Promise<string>;
    restoreStyles: (workspacePath: string, snapshotId: string) => Promise<void>;
    listStyles: (workspacePath: string) => Promise<DocumentSnapshot[]>;
    deleteStyles: (workspacePath: string, snapshotId: string) => Promise<void>;
  };
  assets: {
    list: (workspacePath: string, dirPath: string, recursive?: boolean) => Promise<AssetEntry[]>;
    upload: (
      workspacePath: string,
      dirPath: string,
      files: { name: string; data: Uint8Array }[],
    ) => Promise<void>;
    createDirectory: (workspacePath: string, dirPath: string) => Promise<void>;
    delete: (workspacePath: string, entryPath: string) => Promise<void>;
    rename: (workspacePath: string, oldPath: string, newPath: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    litho: LithoAPI;
  }
}
