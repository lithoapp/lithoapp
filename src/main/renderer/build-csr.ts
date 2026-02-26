import { join } from 'node:path';
import { build } from 'esbuild';
import type { PageSize } from '../../shared/types';
import {
  appNodeModules,
  assembleHtml,
  assetLoaders,
  compileTailwind,
  createAssetResolverPlugin,
  createStripStyleImportsPlugin,
  extractCandidatesFromSource,
  formatCssError,
  formatEsbuildError,
} from './build-shared';

/** Pipeline timings returned before asset inlining. */
export interface CsrPipelineTimings {
  esbuild: number;
  tailwind: number;
  ssrRender: null;
}

/**
 * Build a complete HTML page using client-side rendering.
 *
 * Pipeline: esbuild bundle (platform: browser, format: esm) -> collect workspace sources
 * -> extract Tailwind candidates -> Tailwind compile -> HTML with <script type="module">.
 */
export async function buildPageCsr(
  wsPath: string,
  tsxPath: string,
  css: string,
  size: PageSize,
): Promise<{ html: string; timings: CsrPipelineTimings }> {
  const cssUnit = size.unit === 'px' ? 'px' : 'mm';

  const bootstrap = [
    `import { createRoot } from 'react-dom/client';`,
    `import { createElement } from 'react';`,
    `import Page from ${JSON.stringify(tsxPath)};`,
    `createRoot(document.getElementById('root')).render(`,
    `  createElement('div', {`,
    `    style: { width: '${size.width}${cssUnit}', height: '${size.height}${cssUnit}', overflow: 'hidden', boxSizing: 'border-box' }`,
    `  }, createElement(Page))`,
    `);`,
  ].join('\n');

  const workspaceSources: string[] = [];
  const stripStyleImportsPlugin = createStripStyleImportsPlugin(wsPath, workspaceSources);

  const esbuildStart = performance.now();
  let jsBundle: string;
  try {
    const result = await build({
      stdin: {
        contents: bootstrap,
        loader: 'tsx',
        resolveDir: join(__dirname, '..', '..'),
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      jsx: 'automatic',
      nodePaths: [appNodeModules],
      plugins: [createAssetResolverPlugin(wsPath), stripStyleImportsPlugin],
      loader: assetLoaders,
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    if (result.outputFiles.length === 0) {
      throw new Error('esbuild produced no output');
    }
    jsBundle = result.outputFiles[0].text;
  } catch (err: unknown) {
    throw new Error(formatEsbuildError(err, tsxPath));
  }
  const esbuildMs = Math.round(performance.now() - esbuildStart);

  const candidates = extractCandidatesFromSource(workspaceSources.join('\n'));

  const tailwindStart = performance.now();
  let finalCss: string;
  try {
    finalCss = await compileTailwind(css, wsPath, candidates);
  } catch (err: unknown) {
    throw new Error(formatCssError(err, `${wsPath}/styles.css`));
  }
  const tailwindMs = Math.round(performance.now() - tailwindStart);

  const html = assembleHtml({ css: finalCss, scriptContent: jsBundle });
  return { html, timings: { esbuild: esbuildMs, tailwind: tailwindMs, ssrRender: null } };
}
