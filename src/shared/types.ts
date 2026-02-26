// Cross-process types shared between main, preload, and renderer.

// --- Workspace Server ---

export type WorkspaceServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface WorkspaceServerInfo {
  status: WorkspaceServerStatus;
  port?: number;
  url?: string;
  workspacePath?: string;
  workspaceName?: string;
}

// --- Workspace Errors ---

export type WorkspaceErrorType = 'compilation' | 'api' | 'asset-404' | 'css';

export interface WorkspaceError {
  type: WorkspaceErrorType;
  message: string;
  stack?: string;
  file?: string;
  route?: string;
  method?: string;
  url?: string;
}

// --- Workspace Store ---

export interface WorkspaceEntry {
  path: string;
  name: string;
  lastOpened: string; // ISO 8601
}

// --- OpenCode ---

export type OpencodeStatus = 'starting' | 'running' | 'stopped' | 'crashed' | 'failed';

export interface OpencodeInfo {
  status: OpencodeStatus;
  port?: number;
  uptime?: number;
}

// --- Auto Updater ---

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  progress?: { percent: number };
  error?: string;
}

// --- Document Export ---

export type ExportFormat = 'pdf' | 'png' | 'jpg';

export interface ExportRequest {
  format: ExportFormat;
  serverUrl: string;
  slug: string;
  title: string;
  pages: string[];
  size: { width: number; height: number; unit: 'mm' | 'px' };
  dpi: number;
  jpgQuality: number;
  savePath: string;
}

export type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

export interface ExportProgress {
  status: ExportStatus;
  current: number;
  total: number;
  error?: string;
}

// --- Telemetry ---

export interface TelemetryPreferences {
  enabled: boolean;
}

// --- Assets ---

export interface AssetEntry {
  name: string; // basename e.g. "logo.png"
  path: string; // relative to assets/ dir e.g. "logos/logo.png"
  type: 'file' | 'directory';
  size: number; // bytes; 0 for directories
  ext: string; // lowercase with dot e.g. ".png"; "" for directories
}

// --- Snapshots ---

export interface DocumentSnapshot {
  id: string;
  timestamp: string; // ISO 8601
  promptExcerpt: string; // first 100 chars of user prompt
  assistantMessageId: string;
  files: Record<string, string>; // relative path → content
}
