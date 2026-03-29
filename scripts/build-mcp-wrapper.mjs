import { chmodSync, writeFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

// Bundle the wrapper as CJS — safest for ELECTRON_RUN_AS_NODE which may not
// fully support ESM in all Electron versions.
await esbuild.build({
  entryPoints: ['src/mcp-wrapper/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'resources/bin/litho-mcp.cjs',
});

// macOS / Linux launcher — finds Electron binary relative to itself
const macLauncher = `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
ELECTRON="$DIR/../../MacOS/Litho"
if [ ! -f "$ELECTRON" ]; then
  echo "litho-mcp: Litho.app not found. Is Litho installed?" >&2
  exit 1
fi
ELECTRON_RUN_AS_NODE=1 exec "$ELECTRON" "$DIR/litho-mcp.cjs" "$@"
`;

// Windows launcher — finds Litho.exe relative to itself
const winLauncher = `@echo off
set "DIR=%~dp0"
set "ELECTRON=%DIR%..\\..\\Litho.exe"
if not exist "%ELECTRON%" (
  echo litho-mcp: Litho.exe not found. Is Litho installed? >&2
  exit /b 1
)
set ELECTRON_RUN_AS_NODE=1
"%ELECTRON%" "%DIR%litho-mcp.cjs" %*
`;

writeFileSync('resources/bin/litho-mcp', macLauncher, 'utf8');
chmodSync('resources/bin/litho-mcp', 0o755);

writeFileSync('resources/bin/litho-mcp.cmd', winLauncher, 'utf8');

console.log('Built resources/bin/litho-mcp.cjs');
console.log('Built resources/bin/litho-mcp     (macOS/Linux launcher)');
console.log('Built resources/bin/litho-mcp.cmd (Windows launcher)');
