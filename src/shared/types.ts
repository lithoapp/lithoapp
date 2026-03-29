// Cross-process types shared between main, preload, and renderer.

// --- Workspace Info ---

export interface WorkspaceInfo {
  slug: string;
  title: string;
  documentCount: number;
  createdAt: string;
  lastOpenedAt: string;
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
  workspaceName: string;
  docId: string;
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

export type FeedbackCategory = 'bug-report' | 'feature-idea' | 'general-feedback';

// --- Assets ---

export interface AssetEntry {
  name: string; // basename e.g. "logo.png"
  path: string; // relative to assets/ dir e.g. "logos/logo.png"
  type: 'file' | 'directory';
  size: number; // bytes; 0 for directories
  ext: string; // lowercase with dot e.g. ".png"; "" for directories
  width?: number;
  height?: number;
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

/** Preset page size names. */
export const PAGE_SIZE_NAMES = [
  'A4',
  'A3',
  'A5',
  'Letter',
  'Legal',
  'Tabloid',
  'Instagram Post',
  'Instagram Story',
  'Facebook Post',
  'Facebook Cover',
  'Twitter/X Post',
  'Twitter/X Header',
  'LinkedIn Banner',
  'Pinterest Pin',
  'YouTube Thumbnail',
  'YouTube Channel Art',
  'Slide 16:9',
  'Slide 4:3',
  'Leaderboard',
  'Medium Rectangle',
  'Wide Skyscraper',
  'Facebook Ad',
  'Logo',
  'Email Header',
  'Infographic',
  'Blog Banner',
] as const;

export type PageSizeName = (typeof PAGE_SIZE_NAMES)[number];

/** Preset page sizes. */
export const PAGE_SIZES: Record<PageSizeName, PageSize> = {
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

export interface PageInfo {
  id: string;
  name: string;
  description: string;
}

export interface DocumentConfig {
  title: string;
  size: PageSize;
  pages: PageInfo[];
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

// --- Design System ---

export type TokenCategory =
  | 'color'
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'tracking'
  | 'leading'
  | 'spacing'
  | 'radius'
  | 'shadow'
  | 'gradient';

export type TokenControl = 'color' | 'text' | 'number' | 'shadow' | 'font-stack';

export interface DesignSystemToken {
  variable: string;
  value: string;
  category: TokenCategory;
  control: TokenControl;
  label: string;
  group: string;
}

export interface ColorPalette {
  name: string;
  shades: DesignSystemToken[];
}

export interface DesignSystem {
  colors: {
    palettes: ColorPalette[];
  };
  typography: {
    families: DesignSystemToken[];
    sizes: DesignSystemToken[];
    weights: DesignSystemToken[];
    tracking: DesignSystemToken[];
    leading: DesignSystemToken[];
  };
  spacing: DesignSystemToken[];
  radius: DesignSystemToken[];
  shadows: DesignSystemToken[];
  gradients: DesignSystemToken[];
  fonts: string[];
}

// --- AI Agents ---

export type AgentId = 'document' | 'design-system' | 'workspace';

export interface AgentContext {
  docId?: string;
  title?: string;
  workspaceTitle?: string;
  width?: number;
  height?: number;
  unit?: string;
  userName?: string;
  designSystemDocId?: string | null;
}

// --- Token Usage (per-message) ---

export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// --- Stored Messages (conversation persistence) ---

export interface StoredTextPart {
  type: 'text';
  text: string;
}

export interface StoredReasoningPart {
  type: 'reasoning';
  text: string;
}

export interface StoredToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface StoredToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
}

export interface StoredUserMessage {
  role: 'user';
  id?: string;
  content: string;
}

export interface StoredAssistantMessage {
  role: 'assistant';
  content:
    | string
    | Array<StoredTextPart | StoredReasoningPart | StoredToolCallPart | StoredToolResultPart>;
  /** Per-turn token usage — attached by the main process after each AI response. */
  usage?: MessageUsage;
}

export interface StoredToolMessage {
  role: 'tool';
  content: StoredToolResultPart[];
}

export type StoredMessage = StoredUserMessage | StoredAssistantMessage | StoredToolMessage;

// --- Snapshot Revert ---

export interface RevertResult {
  messages: StoredMessage[];
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

// --- Chat Error ---

export type ChatErrorType = 'rate_limit' | 'auth' | 'server' | 'network' | 'unknown';

export interface ChatError {
  type: ChatErrorType;
  message: string;
  retryAfter?: number;
}

// --- Workspace Mutation Events (pushed from main to renderer) ---

export type WorkspaceMutationEvent =
  | { type: 'page'; action: 'write' | 'edit'; workspaceName: string; docId: string; pageId: string }
  | {
      type: 'page';
      action: 'create' | 'delete' | 'move' | 'updateDetails';
      workspaceName: string;
      docId: string;
    }
  | {
      type: 'document';
      action:
        | 'create'
        | 'delete'
        | 'rename'
        | 'duplicate'
        | 'move'
        | 'updateDescription'
        | 'updateSize';
      workspaceName: string;
      docId: string;
    }
  | { type: 'css'; action: 'write' | 'edit'; workspaceName: string };

// --- Document Type ---

export type DocumentType = 'normal' | 'design-system';

// --- Document Info (replaces ManifestDocument) ---

export interface DocumentInfo {
  id: string;
  title: string;
  type: DocumentType;
  size: PageSize;
  pages: PageInfo[];
  folder?: string;
  updatedAt?: string;
}
