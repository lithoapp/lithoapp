import { basename, resolve, sep } from 'node:path';
import {
  closeWorkspaceDb,
  createNewWorkspace,
  deleteWorkspace,
  getDesignSystemDocId,
  listWorkspaces,
  updateWorkspaceLastOpened,
} from '../../workspace-data';
import {
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_IDS,
  type TemplateId,
} from '../../workspace-data/design-system-pages';
import { slugify } from '../../workspace-data/design-system-parser';
import { getWorkspaceEntry } from '../../workspace-data/registry-db';
import {
  assertWorkspaceNameSafe,
  getWorkspacesBase,
  resolveWorkspacePath,
} from '../../workspace-paths';

export interface CreateWorkspaceParams {
  name: string;
  title?: string;
  templateId?: TemplateId;
}

export interface CreateWorkspaceResult {
  workspaceId: string;
  path: string;
  designSystemDocId: string;
}

export async function handleWorkspaceCreate(
  params: CreateWorkspaceParams,
): Promise<CreateWorkspaceResult> {
  const title = params.title ?? params.name;
  const templateId = params.templateId ?? DEFAULT_TEMPLATE_ID;
  if (!TEMPLATE_IDS.includes(templateId)) {
    throw Object.assign(
      new Error(`Unknown templateId "${templateId}". Valid templates: ${TEMPLATE_IDS.join(', ')}`),
      { code: -32602 }, // JSON-RPC Invalid params
    );
  }
  const slug = await createNewWorkspace(title, templateId);
  const designSystemDocId = (await getDesignSystemDocId(slug)) ?? '';
  return { workspaceId: slug, path: resolveWorkspacePath(slug), designSystemDocId };
}

export interface OpenWorkspaceParams {
  path: string;
}

export async function handleWorkspaceOpen(params: OpenWorkspaceParams): Promise<{
  workspaceId: string;
  title: string;
}> {
  if (typeof params.path !== 'string' || params.path.length === 0) {
    throw Object.assign(new Error('path must be a non-empty string'), { code: -32602 });
  }

  // Resolve and confirm the path lives inside the configured workspaces root.
  // Use path.basename rather than ad-hoc string splitting so Windows-style
  // backslashes work the same as POSIX slashes.
  const base = resolve(getWorkspacesBase());
  const target = resolve(params.path);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw Object.assign(
      new Error(`workspace path is outside the workspaces root: "${params.path}"`),
      { code: -32602 },
    );
  }

  const slug = basename(target);
  // Belt-and-braces: the derived slug must itself be a valid workspace name,
  // otherwise the downstream registry lookup would treat an attacker-supplied
  // string as an opaque identifier.
  assertWorkspaceNameSafe(slug);

  const entry = getWorkspaceEntry(slug);
  if (!entry) {
    throw new Error(`Workspace "${slug}" not found in registry`);
  }
  updateWorkspaceLastOpened(slug);
  return { workspaceId: slug, title: entry.title };
}

export async function handleWorkspaceList(): Promise<{ workspaces: unknown[] }> {
  const workspaces = await listWorkspaces();
  const enriched = await Promise.all(
    workspaces.map(async (ws) => ({
      ...ws,
      designSystemDocId: (await getDesignSystemDocId(ws.slug)) ?? '',
    })),
  );
  return { workspaces: enriched };
}

export async function handleWorkspaceClose(params: {
  workspaceId: string;
}): Promise<Record<string, never>> {
  assertWorkspaceNameSafe(params.workspaceId);
  closeWorkspaceDb(params.workspaceId);
  return {};
}

export async function handleWorkspaceDelete(params: {
  workspaceId: string;
}): Promise<Record<string, never>> {
  assertWorkspaceNameSafe(params.workspaceId);
  await deleteWorkspace(params.workspaceId);
  return {};
}

// Re-export slugify so callers that want deterministic slugs can compute them.
export { slugify };
