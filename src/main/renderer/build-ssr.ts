import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PageSize } from '../../shared/types';
import {
  appNodeModules,
  appRequire,
  assembleHtml,
  assetLoaders,
  compileTailwind,
  createAssetResolverPlugin,
  createStripStyleImportsPlugin,
  extractCandidatesFromSource,
  formatCssError,
  formatEsbuildError,
  toCssUnit,
} from './build-shared';

/** Pipeline timings returned before asset inlining. */
export interface SsrPipelineTimings {
  esbuild: number;
  tailwind: number;
  ssrRender: number;
}

/**
 * Build a complete HTML page using server-side rendering.
 *
 * Pipeline: esbuild bundle (platform: node, format: cjs, external: react/*) -> eval with
 * new Function -> renderToStaticMarkup -> collect workspace sources -> extract candidates
 * -> Tailwind compile -> static HTML (no JS).
 *
 * SSR won't support DOM-dependent libs like recharts — expected limitation.
 */
export async function buildPageSsr(
  wsPath: string,
  pageSource: string,
  css: string,
  size: PageSize,
): Promise<{ html: string; timings: SsrPipelineTimings }> {
  const workspaceSources: string[] = [pageSource];
  const stripStyleImportsPlugin = createStripStyleImportsPlugin(wsPath, workspaceSources);

  const entrySource = pageSource.replace(/import\s+['"]@styles\.css['"];?\s*/g, '');

  const esbuildStart = performance.now();
  let cjsBundle: string;
  try {
    const result = await build({
      stdin: {
        contents: entrySource,
        loader: 'tsx',
        resolveDir: wsPath,
      },
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      jsx: 'automatic',
      nodePaths: [appNodeModules],
      plugins: [createAssetResolverPlugin(wsPath), stripStyleImportsPlugin],
      loader: assetLoaders,
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    if (result.outputFiles.length === 0) {
      throw new Error('esbuild produced no output');
    }
    cjsBundle = result.outputFiles[0].text;
  } catch (err: unknown) {
    throw new Error(formatEsbuildError(err, '<page>'));
  }
  const esbuildMs = Math.round(performance.now() - esbuildStart);

  // Evaluate the CJS bundle, providing a require that resolves from the app's node_modules
  let PageComponent: React.ComponentType;
  try {
    const mod = { exports: {} as Record<string, unknown> };
    const fn = new Function('require', 'module', 'exports', cjsBundle);
    fn(appRequire, mod, mod.exports);
    const exported = mod.exports.default ?? mod.exports;
    if (typeof exported !== 'function') {
      throw new Error(`Expected default export to be a component function, got ${typeof exported}`);
    }
    PageComponent = exported as React.ComponentType;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SSR eval failed: ${message}`);
  }

  // Render to static HTML, wrapping in a sized container matching document.json
  const cssUnit = toCssUnit(size.unit);
  const ssrStart = performance.now();
  let bodyHtml: string;
  try {
    bodyHtml = renderToStaticMarkup(
      createElement(
        'div',
        {
          style: {
            width: `${size.width}${cssUnit}`,
            height: `${size.height}${cssUnit}`,
            overflow: 'hidden',
            boxSizing: 'border-box',
          },
        },
        createElement(PageComponent),
      ),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SSR render failed: ${message}`);
  }
  const ssrRenderMs = Math.round(performance.now() - ssrStart);

  const candidates = extractCandidatesFromSource(workspaceSources.join('\n'));

  const tailwindStart = performance.now();
  let finalCss: string;
  try {
    finalCss = await compileTailwind(css, wsPath, candidates);
  } catch (err: unknown) {
    throw new Error(formatCssError(err, 'styles.css'));
  }
  const tailwindMs = Math.round(performance.now() - tailwindStart);

  const html = assembleHtml({ css: finalCss, bodyHtml });
  return { html, timings: { esbuild: esbuildMs, tailwind: tailwindMs, ssrRender: ssrRenderMs } };
}
