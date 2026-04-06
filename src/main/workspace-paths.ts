import { join, resolve, sep } from 'node:path';
import { app } from 'electron';

// ---------------------------------------------------------------------------
// Workspaces root resolution
//
// Resolution order:
//   1. Explicit override set via setWorkspacesRootOverride() (headless CLI flag
//      --workspaces-root, parsed at the top of src/main/index.ts)
//   2. <userData>/workspaces (default)
//
// All workspace storage (per-workspace DBs, assets) and the global registry.db
// live under this root. The override must be set before any module opens a
// database — src/main/index.ts parses argv and calls setWorkspacesRootOverride
// at the top of the file, before registerAiProviderHandlers() triggers the
// first DB open.
//
// resolveWorkspacePath() enforces a traversal guard: every caller-supplied
// workspace name is rejected if it could escape the base. This is the single
// chokepoint for filesystem-based workspace access, so guarding here closes
// the attack surface for every downstream caller (getWorkspaceDb, assets
// manager, exporter, delete, etc.) without requiring individual audits.
// ---------------------------------------------------------------------------

// JSON-RPC 2.0 "Invalid params" code. We tag thrown errors with this so the
// headless dispatcher can surface -32602 to clients. Using a literal here to
// avoid a layering violation (workspace-paths.ts is below main/headless/).
const RPC_INVALID_PARAMS = -32602;

function makeInvalidParamsError(message: string): Error {
  return Object.assign(new Error(message), { code: RPC_INVALID_PARAMS });
}

/**
 * Reject workspace names that could be used as a path-traversal attack.
 * Syntactic guard — the post-resolution prefix check in resolveWorkspacePath
 * is the belt-and-braces backstop.
 *
 * In-app flow always passes slugify() output (`[a-z0-9-]+`), so this check
 * is a no-op there. It only fires on caller-controlled input reaching us
 * through the headless JSON-RPC surface.
 */
export function assertWorkspaceNameSafe(name: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw makeInvalidParamsError('workspace name must be a non-empty string');
  }
  if (name.includes('\0')) {
    throw makeInvalidParamsError('workspace name contains null byte');
  }
  if (name.includes('/') || name.includes('\\')) {
    throw makeInvalidParamsError(`workspace name contains path separator: "${name}"`);
  }
  if (name === '.' || name === '..' || name.startsWith('.')) {
    throw makeInvalidParamsError(`workspace name is reserved or hidden: "${name}"`);
  }
  // Defense in depth: any non-safe character at all is a red flag. This
  // matches slugify()'s output contract (see design-system-parser.ts).
  if (!/^[a-z0-9-]+$/i.test(name)) {
    throw makeInvalidParamsError(`workspace name must match [a-z0-9-]+ (got "${name}")`);
  }
}

let overrideRoot: string | null = null;

export function setWorkspacesRootOverride(root: string): void {
  overrideRoot = root;
}

export function getWorkspacesBase(): string {
  if (overrideRoot) return overrideRoot;
  return join(app.getPath('userData'), 'workspaces');
}

export function resolveWorkspacePath(name: string): string {
  assertWorkspaceNameSafe(name);
  const base = resolve(getWorkspacesBase());
  const target = resolve(join(base, name));
  // Post-resolution prefix check. Should be impossible to reach given the
  // syntactic guard above, but defensive — if a future change loosens the
  // guard, this catches escapes.
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw makeInvalidParamsError(`workspace path escapes workspaces root: "${name}"`);
  }
  return target;
}

/**
 * Path to the global registry.db. When a workspaces-root override is active
 * (headless --workspaces-root flag), registry.db lives inside that root so
 * eval runs are fully isolated from the developer's real app state. Otherwise
 * it stays at its historical location, <userData>/registry.db.
 */
export function getRegistryDbPath(): string {
  if (overrideRoot) return join(overrideRoot, 'registry.db');
  return join(app.getPath('userData'), 'registry.db');
}
