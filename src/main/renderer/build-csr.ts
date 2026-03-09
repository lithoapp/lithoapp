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
  toCssUnit,
} from './build-shared';
import { EDITOR_SCRIPT } from './editor-script';
import { injectLocAttributes } from './loc-plugin';

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
  pageSource: string,
  css: string,
  size: PageSize,
  options?: { editMode?: boolean; pageId?: string },
): Promise<{ html: string; timings: CsrPipelineTimings }> {
  const cssUnit = toCssUnit(size.unit);

  const bootstrap = [
    `import { createRoot } from 'react-dom/client';`,
    `import { createElement } from 'react';`,
    `import Page from 'virtual:page-entry';`,
    `createRoot(document.getElementById('root')).render(`,
    `  createElement('div', {`,
    `    style: { width: '${size.width}${cssUnit}', height: '${size.height}${cssUnit}', overflow: 'hidden', boxSizing: 'border-box' }`,
    `  }, createElement(Page))`,
    `);`,
  ].join('\n');

  const workspaceSources: string[] = [pageSource];
  const stripStyleImportsPlugin = createStripStyleImportsPlugin(wsPath, workspaceSources);

  const pageEntryPlugin = {
    name: 'virtual-page-entry',
    setup(b: import('esbuild').PluginBuild) {
      b.onResolve({ filter: /^virtual:page-entry$/ }, () => ({
        path: 'virtual:page-entry',
        namespace: 'virtual-page',
      }));
      b.onLoad({ filter: /.*/, namespace: 'virtual-page' }, () => {
        // Inject loc attributes BEFORE stripping imports so line numbers match
        // the original source that the AI agent reads from the database.
        let contents = pageSource;
        if (options?.editMode && options.pageId) {
          contents = injectLocAttributes(contents, options.pageId);
        }
        contents = contents.replace(/import\s+['"]@styles\.css['"];?\s*/g, '');
        return { contents, loader: 'tsx' as const, resolveDir: wsPath };
      });
    },
  };

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
      plugins: [pageEntryPlugin, createAssetResolverPlugin(wsPath), stripStyleImportsPlugin],
      loader: assetLoaders,
      define: { 'process.env.NODE_ENV': '"production"' },
    });
    if (result.outputFiles.length === 0) {
      throw new Error('esbuild produced no output');
    }
    jsBundle = result.outputFiles[0].text;
  } catch (err: unknown) {
    throw new Error(formatEsbuildError(err, '<page>'));
  }
  const esbuildMs = Math.round(performance.now() - esbuildStart);

  const candidates = extractCandidatesFromSource(workspaceSources.join('\n'));

  const tailwindStart = performance.now();
  let finalCss: string;
  try {
    finalCss = await compileTailwind(css, wsPath, candidates);
  } catch (err: unknown) {
    throw new Error(formatCssError(err, 'styles.css'));
  }
  const tailwindMs = Math.round(performance.now() - tailwindStart);

  const html = assembleHtml({
    css: finalCss,
    scriptContent: jsBundle,
    editorScript: options?.editMode ? EDITOR_SCRIPT : undefined,
  });
  return { html, timings: { esbuild: esbuildMs, tailwind: tailwindMs, ssrRender: null } };
}
