import { tmpdir } from 'node:os';
import type { PageBuildData, PageSize, RenderApproach, RendererResult } from '../../shared/types';
import { captureException } from '../sentry';
import {
  readPageSource,
  readStyles,
  readDocumentConfig as wsReadDocumentConfig,
} from '../workspace-data';
import {
  getTemplatePreviewSource,
  getTemplateStyles,
  TEMPLATE_IDS,
  type TemplateId,
} from '../workspace-data/design-system-pages';
import { resolveWorkspacePath } from '../workspace-paths';
import { inlineAssetRefs } from './build-shared';
import { detectApproach } from './detect-approach';

/** Run the SSR or CSR pipeline for a given approach. */
async function runPipeline(
  approach: RenderApproach,
  wsPath: string,
  pageSource: string,
  css: string,
  size: PageSize,
): Promise<{
  html: string;
  timings: { esbuild: number; tailwind: number; ssrRender: number | null };
}> {
  if (approach === 'ssr') {
    const { buildPageSsr } = await import('./build-ssr');
    return buildPageSsr(wsPath, pageSource, css, size);
  }
  const { buildPageCsr } = await import('./build-csr');
  return buildPageCsr(wsPath, pageSource, css, size);
}

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
    let { html, timings: pipelineTimings } = await runPipeline(
      resolvedApproach,
      wsPath,
      pageSource,
      css,
      config.size,
    );

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
    const stage = inferStage(err);
    captureException(err, {
      tags: { component: 'renderer', stage: stage ?? 'unknown' },
      extras: { workspace, document, page, approach },
    });
    return {
      ok: false,
      error: {
        code: 'BUILD_FAILED',
        message: err instanceof Error ? err.message : String(err),
        stage,
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

// ---------------------------------------------------------------------------
// Template preview builds (cached in memory — templates are static)
// ---------------------------------------------------------------------------

const previewCache = new Map<TemplateId, string>();

const PREVIEW_SIZE = { width: 640, height: 360, unit: 'px' as const };

export async function buildTemplatePreview(templateId: TemplateId): Promise<string> {
  const cached = previewCache.get(templateId);
  if (cached) return cached;

  const css = getTemplateStyles(templateId);
  const pageSource = getTemplatePreviewSource(templateId);
  const approach = detectApproach(pageSource);

  const { html } = await runPipeline(approach, tmpdir(), pageSource, css, PREVIEW_SIZE);

  previewCache.set(templateId, html);
  return html;
}

export async function buildAllTemplatePreviews(): Promise<Record<TemplateId, string>> {
  const results = {} as Record<TemplateId, string>;
  for (const id of TEMPLATE_IDS) {
    try {
      results[id] = await buildTemplatePreview(id);
    } catch (err) {
      captureException(err, {
        tags: { component: 'renderer', stage: 'template-preview' },
        extras: { templateId: id },
      });
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Template preview build failed for "${id}": ${message}`);
    }
  }
  return results;
}
