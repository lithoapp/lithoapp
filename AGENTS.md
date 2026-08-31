# lithoapp

Electron desktop app for the Litho PDF design system. React 19 + Tailwind CSS v4, built with electron-vite.

## Layout
- `src/main/` — main process: windows, IPC, SQLite workspace data, render/export, MCP server, headless JSON-RPC
- `src/main/ai-providers/` — AI SDK integration: providers, credentials, OAuth, chat streaming, agent tools
- `src/agents/` — agent prompt templates (`system.md`, `kickoff.md`)
- `src/preload/` — `contextBridge` API exposed as `window.litho`
- `src/renderer/src/` — React UI: `pages/`, `components/`, `hooks/`, `lib/`; `src/shared/` — cross-process types

## Commands
`pnpm install` · `pnpm dev` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build`

## Conventions
- kebab-case files, camelCase values, PascalCase components; booleans read `is`/`has`/`can`
- Named exports only, imported from source; no barrel files
- Strict TypeScript, no `any`; fail fast with explicit errors over silent fallbacks
- Biome: single quotes, 2-space indent, 100-char lines
