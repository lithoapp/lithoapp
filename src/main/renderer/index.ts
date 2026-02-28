import type { PageBuildData, RenderApproach, RendererResult } from '../../shared/types';
import {
  readPageSource,
  readStyles,
  readDocumentConfig as wsReadDocumentConfig,
} from '../workspace-data';
import { resolveWorkspacePath } from '../workspace-paths';
import { inlineAssetRefs } from './build-shared';
import { detectApproach } from './detect-approach';

export async function buildPage(
  workspace: string,
  document: string,
  page: string,
  approach?: RenderApproach,
): Promise<RendererResult<PageBuildData>> {
  try {
    const totalStart = performance.now();

    const wsPath = resolveWorkspacePath(workspace);
    const [pageSource, css, config] = await Promise.all([
      readPageSource(workspace, document, page),
      readStyles(workspace),
      wsReadDocumentConfig(workspace, document),
    ]);

    const resolvedApproach = approach ?? detectApproach(pageSource);

    let html: string;
    let pipelineTimings: { esbuild: number; tailwind: number; ssrRender: number | null };

    if (resolvedApproach === 'ssr') {
      const { buildPageSsr } = await import('./build-ssr');
      ({ html, timings: pipelineTimings } = await buildPageSsr(
        wsPath,
        pageSource,
        css,
        config.size,
      ));
    } else {
      const { buildPageCsr } = await import('./build-csr');
      ({ html, timings: pipelineTimings } = await buildPageCsr(
        wsPath,
        pageSource,
        css,
        config.size,
      ));
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

function inferStage(err: unknown): 'esbuild' | 'tailwind' | 'ssr-render' | undefined {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('Syntax error in') || message.includes('esbuild')) return 'esbuild';
  if (message.includes('CSS error in') || message.includes('tailwind')) return 'tailwind';
  if (message.includes('SSR render failed') || message.includes('SSR eval failed'))
    return 'ssr-render';
  return undefined;
}
