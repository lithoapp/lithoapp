import type {
  DocumentConfig,
  PageBuildData,
  PageExportOptions,
  RenderApproach,
  RendererResult,
} from '../../shared/types';
import { inlineAssetRefs } from './build-shared';
import { detectApproach } from './detect-approach';
import {
  listDocuments as fsListDocuments,
  listPages as fsListPages,
  listWorkspaces as fsListWorkspaces,
  readDocumentConfig as fsReadDocumentConfig,
  readPageSource,
  readStyles,
} from './fs-reader';
import { pageFilePath, workspacePath } from './paths';

export async function buildPage(
  workspace: string,
  document: string,
  page: string,
  approach?: RenderApproach,
): Promise<RendererResult<PageBuildData>> {
  try {
    const totalStart = performance.now();

    const wsPath = workspacePath(workspace);
    const tsxPath = pageFilePath(workspace, document, page);
    const [pageSource, css, config] = await Promise.all([
      readPageSource(workspace, document, page),
      readStyles(workspace),
      fsReadDocumentConfig(workspace, document),
    ]);

    const resolvedApproach = approach ?? detectApproach(pageSource);

    let html: string;
    let pipelineTimings: { esbuild: number; tailwind: number; ssrRender: number | null };

    if (resolvedApproach === 'ssr') {
      const { buildPageSsr } = await import('./build-ssr');
      ({ html, timings: pipelineTimings } = await buildPageSsr(wsPath, tsxPath, css, config.size));
    } else {
      const { buildPageCsr } = await import('./build-csr');
      ({ html, timings: pipelineTimings } = await buildPageCsr(wsPath, tsxPath, css, config.size));
    }

    const assetStart = performance.now();
    html = inlineAssetRefs(html, wsPath);
    const assetInlining = Math.round(performance.now() - assetStart);

    return {
      ok: true,
      data: {
        html,
        htmlBytes: Buffer.byteLength(html, 'utf-8'),
        approach: resolvedApproach,
        timings: {
          ...pipelineTimings,
          assetInlining,
          total: Math.round(performance.now() - totalStart),
        },
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'BUILD_FAILED',
        message: err instanceof Error ? err.message : String(err),
        stage: inferStage(err),
      },
    };
  }
}

export async function readDocumentConfig(
  workspace: string,
  document: string,
): Promise<RendererResult<DocumentConfig>> {
  try {
    return { ok: true, data: await fsReadDocumentConfig(workspace, document) };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'CONFIG_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function listWorkspaces(): Promise<RendererResult<string[]>> {
  try {
    return { ok: true, data: await fsListWorkspaces() };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'LIST_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function listDocuments(workspace: string): Promise<RendererResult<string[]>> {
  try {
    return { ok: true, data: await fsListDocuments(workspace) };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'LIST_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function listPages(
  workspace: string,
  document: string,
): Promise<RendererResult<string[]>> {
  try {
    return { ok: true, data: await fsListPages(workspace, document) };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'LIST_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export async function exportPageResult(options: PageExportOptions): Promise<RendererResult<void>> {
  try {
    const { exportPage } = await import('./export-page');
    await exportPage(options);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'EXPORT_FAILED',
        message: err instanceof Error ? err.message : String(err),
        stage: 'export',
      },
    };
  }
}

function inferStage(err: unknown): 'esbuild' | 'tailwind' | 'ssr-render' | undefined {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('Syntax error in') || message.includes('esbuild')) return 'esbuild';
  if (message.includes('CSS error in') || message.includes('tailwind')) return 'tailwind';
  if (message.includes('SSR render failed') || message.includes('SSR eval failed'))
    return 'ssr-render';
  return undefined;
}
