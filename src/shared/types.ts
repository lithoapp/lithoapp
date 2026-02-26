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

// --- Workspace Info ---

export interface WorkspaceInfo {
  slug: string;
  name: string;
  documentCount: number;
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

// --- Workspace Data ---

export interface WorkspaceConfig {
  name: string;
}

export interface PageSize {
  width: number;
  height: number;
  unit: 'mm' | 'px';
}

/** Preset page sizes — mirrors PAGE_SIZES from @kareemaly/litho-workspace-server/src/sizes.ts */
export const PAGE_SIZES: Record<string, PageSize> = {
  A4: { width: 210, height: 297, unit: 'mm' },
  A3: { width: 297, height: 420, unit: 'mm' },
  A5: { width: 148, height: 210, unit: 'mm' },
  Letter: { width: 215.9, height: 279.4, unit: 'mm' },
  Legal: { width: 215.9, height: 355.6, unit: 'mm' },
  Tabloid: { width: 279.4, height: 431.8, unit: 'mm' },
  'Instagram Post': { width: 1080, height: 1080, unit: 'px' },
  'Instagram Story': { width: 1080, height: 1920, unit: 'px' },
  'Facebook Post': { width: 1200, height: 630, unit: 'px' },
  'Facebook Cover': { width: 820, height: 312, unit: 'px' },
  'Twitter/X Post': { width: 1200, height: 675, unit: 'px' },
  'Twitter/X Header': { width: 1500, height: 500, unit: 'px' },
  'LinkedIn Banner': { width: 1584, height: 396, unit: 'px' },
  'Pinterest Pin': { width: 1000, height: 1500, unit: 'px' },
  'YouTube Thumbnail': { width: 1280, height: 720, unit: 'px' },
  'YouTube Channel Art': { width: 2560, height: 1440, unit: 'px' },
  'Slide 16:9': { width: 1920, height: 1080, unit: 'px' },
  'Slide 4:3': { width: 1024, height: 768, unit: 'px' },
  Leaderboard: { width: 728, height: 90, unit: 'px' },
  'Medium Rectangle': { width: 300, height: 250, unit: 'px' },
  'Wide Skyscraper': { width: 160, height: 600, unit: 'px' },
  'Facebook Ad': { width: 1200, height: 628, unit: 'px' },
  Logo: { width: 500, height: 500, unit: 'px' },
  'Email Header': { width: 600, height: 200, unit: 'px' },
  Infographic: { width: 800, height: 2000, unit: 'px' },
  'Blog Banner': { width: 1200, height: 600, unit: 'px' },
};

export interface DocumentConfig {
  title: string;
  size: PageSize;
  pages: string[];
}

// --- Renderer ---

export type RendererResult<T> = { ok: true; data: T } | { ok: false; error: RendererError };

export interface RendererError {
  code: 'BUILD_FAILED' | 'EXPORT_FAILED' | 'CONFIG_ERROR' | 'LIST_FAILED';
  message: string;
  stage?: 'esbuild' | 'tailwind' | 'ssr-render' | 'export';
}

export type RenderApproach = 'ssr' | 'csr';

export interface BuildTimings {
  esbuild: number;
  tailwind: number;
  ssrRender: number | null;
  assetInlining: number;
  total: number;
}

export interface PageBuildData {
  html: string;
  htmlBytes: number;
  approach: RenderApproach;
  timings: BuildTimings;
}

export interface PageExportOptions {
  html: string;
  approach: RenderApproach;
  format: ExportFormat;
  size: PageSize;
  dpi: number;
  jpgQuality: number;
  savePath: string;
}

// --- Snapshots ---

export interface DocumentSnapshot {
  id: string;
  timestamp: string; // ISO 8601
  promptExcerpt: string; // first 100 chars of user prompt
  assistantMessageId: string;
  files: Record<string, string>; // relative path → content
}
