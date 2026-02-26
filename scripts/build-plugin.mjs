import { build } from 'esbuild';

await build({
  entryPoints: ['src/agents/plugins/litho-tools.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'esnext',
  outfile: 'resources/opencode-plugin/litho-tools.mjs',
  external: ['node:fs/promises', 'node:path'],
});
