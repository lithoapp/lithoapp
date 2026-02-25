export type ToolIcon = 'search' | 'eye' | 'pencil' | 'plus' | 'error' | 'terminal';

export interface ToolLabel {
  label: string;
  icon: ToolIcon;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deslugify(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractRelativePath(raw: string): string {
  const match = raw.match(/litho-workspaces\/[^/]+\/(.+)/);
  return match?.[1] ?? raw;
}

function fallbackLabel(tool: string, path?: string): ToolLabel {
  const name = path?.split('/').pop() ?? '';
  switch (tool) {
    case 'glob':
      return { label: name ? `Searching ${name}` : 'Searching files', icon: 'search' };
    case 'read':
      return { label: name ? `Reading ${name}` : 'Reading a file', icon: 'eye' };
    case 'write':
      return { label: name ? `Creating ${name}` : 'Creating a file', icon: 'plus' };
    case 'edit':
      return { label: name ? `Editing ${name}` : 'Editing a file', icon: 'pencil' };
    default:
      return { label: tool, icon: 'terminal' };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function resolveToolLabel(tool: string, rawTitle: string): ToolLabel {
  if (!rawTitle) return fallbackLabel(tool);

  const path = extractRelativePath(rawTitle);

  // Design system
  if (path === 'styles.css' || path.endsWith('/styles.css')) {
    return tool === 'read'
      ? { label: 'Reviewing design system', icon: 'eye' }
      : { label: 'Updating design system', icon: 'pencil' };
  }

  // Document page file
  const pageMatch = path.match(/documents\/([^/]+)\/pages\/page-(\d+)\.tsx$/);
  if (pageMatch) {
    const doc = deslugify(pageMatch[1]);
    const page = pageMatch[2];
    if (tool === 'read') return { label: `Reading ${doc}, page ${page}`, icon: 'eye' };
    if (tool === 'write') return { label: `Creating ${doc}, page ${page}`, icon: 'plus' };
    return { label: `Editing ${doc}, page ${page}`, icon: 'pencil' };
  }

  // Document JSON
  const docJsonMatch = path.match(/documents\/([^/]+)\/document\.json$/);
  if (docJsonMatch) {
    return { label: `Examining ${deslugify(docJsonMatch[1])} structure`, icon: 'eye' };
  }

  // Specific document directory
  const docDirMatch = path.match(/^documents\/([^/]+)\/?$/);
  if (docDirMatch) {
    return { label: `Exploring ${deslugify(docDirMatch[1])}`, icon: 'search' };
  }

  // Documents root
  if (/^documents\/?$/.test(path)) {
    return { label: 'Browsing documents', icon: 'search' };
  }

  // Assets
  if (path.startsWith('assets') || /\/assets(\/|$)/.test(path)) {
    return tool === 'read'
      ? { label: 'Checking an asset', icon: 'eye' }
      : { label: 'Looking through assets', icon: 'search' };
  }

  // Workspace root glob
  if (/^[^/]*\/?$/.test(path) && tool === 'glob') {
    return { label: 'Exploring workspace', icon: 'search' };
  }

  return fallbackLabel(tool, path);
}

export function summarizeStep(labels: string[]): string {
  if (labels.length === 0) return 'Thinking';
  if (labels.length === 1) return labels[0];
  return labels.join(', ');
}
