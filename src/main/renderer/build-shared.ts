import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';
import { compile } from '@tailwindcss/node';
import type { Loader, Plugin } from 'esbuild';

// __dirname is replaced at build time by electron-vite and always resolves to out/main/,
// regardless of source file location. Keep paths relative to that.
export const appRequire = createRequire(join(__dirname, '..', 'package.json'));
export const appNodeModules = join(__dirname, '..', '..', 'node_modules');

/** Esbuild loaders that inline image/font assets as base64 data URIs. */
export const assetLoaders: Record<string, Loader> = {
  '.png': 'dataurl',
  '.jpg': 'dataurl',
  '.jpeg': 'dataurl',
  '.gif': 'dataurl',
  '.webp': 'dataurl',
  '.svg': 'dataurl',
  '.ico': 'dataurl',
  '.woff': 'dataurl',
  '.woff2': 'dataurl',
};

/** Map file extension to MIME type for data URI inlining. */
const MIME_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Compile Tailwind CSS using the workspace as base, with fallback resolution
 * to the app's node_modules for bare specifiers like "tailwindcss".
 */
export async function compileTailwind(
  css: string,
  wsPath: string,
  candidates: string[],
): Promise<string> {
  const compiled = await compile(css, {
    base: wsPath,
    onDependency: () => {},
    customCssResolver: async (id) => {
      try {
        return appRequire.resolve(`${id}/index.css`);
      } catch {
        try {
          return appRequire.resolve(id);
        } catch {
          return undefined;
        }
      }
    },
  });
  return compiled.build(candidates);
}

/**
 * Extract Tailwind class candidates from TSX source by scanning all quoted strings.
 * Intentionally broad — Tailwind's build() ignores unrecognized candidates.
 */
export function extractCandidatesFromSource(source: string): string[] {
  const candidates = new Set<string>();

  for (const match of source.matchAll(/["'`]([^"'`\n]+)["'`]/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (token) candidates.add(token);
    }
  }

  return [...candidates];
}

/**
 * Esbuild plugin factory that strips `@styles.css` imports and collects
 * source text from workspace TSX files for Tailwind candidate extraction.
 */
export function createStripStyleImportsPlugin(wsPath: string, workspaceSources: string[]): Plugin {
  return {
    name: 'strip-style-imports',
    setup(b) {
      b.onLoad({ filter: /\.tsx$/ }, (args) => {
        const source = readFileSync(args.path, 'utf-8');
        if (args.path.startsWith(wsPath)) {
          workspaceSources.push(source);
        }
        return {
          contents: source.replace(/import\s+['"]@styles\.css['"];?\s*/g, ''),
          loader: 'tsx',
        };
      });
    },
  };
}

/**
 * Esbuild plugin that resolves `@assets/*` imports to `{workspacePath}/assets/*`.
 */
export function createAssetResolverPlugin(wsPath: string): Plugin {
  return {
    name: 'resolve-workspace-assets',
    setup(b) {
      b.onResolve({ filter: /^@assets\// }, (args) => ({
        path: join(wsPath, 'assets', args.path.slice('@assets/'.length)),
      }));
    },
  };
}

/**
 * Format an esbuild transform/build error into a human-readable message
 * pointing at the original file path, line, and column.
 */
export function formatEsbuildError(err: unknown, filePath: string): string {
  const esbuildErr = err as {
    errors?: { text: string; location?: { line: number; column: number; lineText: string } }[];
  };
  const first = esbuildErr.errors?.[0];
  if (!first?.location) {
    return `Syntax error in ${filePath}: ${err instanceof Error ? err.message : String(err)}`;
  }
  const { line, column, lineText } = first.location;
  const pointer = `${' '.repeat(column)}^`;
  return `Syntax error in ${filePath}:${line}:${column}\n\n  ${lineText}\n  ${pointer}\n\n${first.text}`;
}

/**
 * Format a Tailwind/CSS compile error into a human-readable message.
 */
export function formatCssError(err: unknown, filePath: string): string {
  const cssErr = err as {
    message?: string;
    loc?: { line?: number; column?: number } | null;
  };
  const message = cssErr.message ?? String(err);
  const loc = cssErr.loc;
  if (loc?.line) {
    const location = loc.column ? `${loc.line}:${loc.column}` : String(loc.line);
    return `CSS error in ${filePath}:${location}\n\n${message}`;
  }
  return `CSS error in ${filePath}: ${message}`;
}

/**
 * Replace `@assets/...` references in the final HTML with base64 data URIs.
 * Handles both HTML attributes (e.g. `<img src="@assets/...">`) and CSS
 * `url(@assets/...)` patterns.
 */
export function inlineAssetRefs(html: string, wsPath: string): string {
  return html.replace(/@assets\/[^\s"')]+/g, (match) => {
    const relativePath = match.slice('@assets/'.length);
    const absPath = join(wsPath, 'assets', relativePath);

    if (!existsSync(absPath)) return match;

    const ext = extname(absPath).toLowerCase();
    const mime = MIME_TYPES[ext];
    if (!mime) return match;

    const base64 = readFileSync(absPath).toString('base64');
    return `data:${mime};base64,${base64}`;
  });
}

/**
 * Pull `@import url(...)` rules out of compiled CSS and convert them to `<link>` tags.
 * Sandboxed srcdoc iframes can't fetch CSS via @import inside <style>, but <link> works.
 */
function extractUrlImports(css: string): { linkTags: string; inlineCss: string } {
  const urls: string[] = [];
  const inlineCss = css.replace(/@import\s+url\((['"]?)(.+?)\1\)\s*;?/g, (_match, _q, url) => {
    urls.push(url);
    return '';
  });
  const linkTags = urls.map((url) => `<link rel="stylesheet" href="${url}">`).join('\n');
  return { linkTags, inlineCss };
}

/**
 * Assemble a complete HTML document.
 * CSR passes `scriptContent` (client JS), SSR passes `bodyHtml` (static markup).
 */
export function assembleHtml(options: {
  css: string;
  scriptContent?: string;
  bodyHtml?: string;
}): string {
  const { linkTags, inlineCss } = extractUrlImports(options.css);

  const bodyContent = options.bodyHtml
    ? options.bodyHtml
    : '<div id="root" style="height:100%"></div>';

  const scriptTag = options.scriptContent
    ? `\n<script type="module">${options.scriptContent}</script>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
${linkTags}
<style>html, body { margin: 0; padding: 0; overflow: hidden; }
${inlineCss}</style>
</head>
<body>
${bodyContent}${scriptTag}
</body>
</html>`;
}
