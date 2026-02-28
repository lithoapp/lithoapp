# lithoapp

Electron 40 desktop application for the Litho PDF design system. React 19 + Tailwind CSS v4, built with `electron-vite`, packaged via `electron-builder`.

## Build & Development Commands

```bash
pnpm install              # Install dependencies
pnpm build:plugin         # Bundle OpenCode plugin (runs before dev/build)
pnpm dev                  # Start in Electron dev mode (HMR)
pnpm build                # Build for production (electron-vite build)
pnpm start                # Preview production build
pnpm test                 # Run tests (vitest)
pnpm lint                 # Lint with Biome
pnpm format               # Auto-fix lint/format issues
pnpm typecheck            # Type-check (main + renderer)
```

## Architecture

### Main Process (`src/main/`)

- `index.ts` — Window creation, ~50 IPC handlers, `litho-asset://` custom protocol, app lifecycle
- `renderer/` — Offline build pipeline (TSX + Tailwind → HTML): `build-csr.ts`, `build-ssr.ts`, `build-shared.ts`, `detect-approach.ts`
- `exporter/` — Export capture & assembly: `export-page.ts` (hidden BrowserWindow → PDF/PNG/JPG buffer), `document-exporter.ts` (multi-page orchestrator), `batch-export.ts` (CLI batch entry point)
- `workspace-data/` — SQLite-backed data layer: `db.ts` (connection pool, schema, migrations), `db-backend.ts` (CRUD operations), `registry-db.ts` (global workspace registry), `design-system-parser.ts` (CSS token extraction), `design-system-pages.ts` (template page definitions), `export-source.ts` (workspace ZIP export), `templates/` (Mustache templates for design system pages)
- `workspace-paths.ts` — Resolves workspace name → `~/litho-workspaces/<name>`
- `active-workspace-store.ts` — Tracks the currently active workspace (JSON in userData)
- `opencode-manager.ts` — Manages OpenCode AI server lifecycle with crash recovery (exponential backoff, max 5 retries)
- `assets-manager.ts` — Workspace asset CRUD with path traversal protection
- `auto-updater.ts` — electron-updater for GitHub releases
- `telemetry-store.ts` — User preferences (telemetry, profile, theme, advanced tools)
- `sentry.ts` — Error reporting initialization

### Agents (`src/agents/`)

Two AI agents powered by OpenCode SDK, each with scoped tool permissions:

- **design-system** (`design-system/`) — Creative design partner for visual branding. Edits workspace `styles.css` (Tailwind v4 `@theme` block) and manages design system document pages. Has read/write access to styles and all page tools.
- **document** (`document/`) — Creative partner for building PDF pages. Reads design system styles (read-only) and manages document pages. No write access to styles.

Each agent has: `config.ts` (tool permissions, description), `system.md` (system prompt), `prompt.md` (detailed prompt), `kickoff.md` (first message template).

**Plugin** (`plugins/litho-tools.ts`) — 11 tools exposed to agents via OpenCode plugin system:
- Page tools: `listPages`, `readPage`, `writePage`, `editPage`, `createPage`, `deletePage`, `updatePageDetails`, `movePage`
- Style tools: `readMainCss`, `writeMainCss`, `editMainCss`
- `editPage`/`editMainCss` use a 9-level fuzzy string replacement engine (`plugins/replace.ts`) for handling whitespace/indentation variations.

The plugin is bundled by `scripts/build-plugin.mjs` (esbuild → `resources/opencode-plugin/litho-tools.mjs`) and runs inside the OpenCode server process with its own Bun SQLite connection to `workspace.db`.

### Preload (`src/preload/`)

`contextBridge` exposes `window.litho` API with namespaces: `preferences`, `telemetry`, `advancedTools`, `opencode`, `app`, `update`, `export`, `workspace`, `document`, `designSystem`, `renderer`, `assets`

### Renderer (`src/renderer/`)

- React 19 + Tailwind CSS v4 + shadcn/ui components (Radix UI)
- **Router**: Centralized state machine in `App.tsx` — no file-based routing. `Page` union type drives navigation.
- **Pages**: Onboarding (profile setup + provider picker), Workspaces, Documents (grid with thumbnails), Document viewer (with chat panel + page audit bar), Design System Doc (token editor + chat), Assets browser, Settings v2 (sidebar + tabs: profile, AI providers, privacy, about, advanced), Renderer POC (build/export testing)
- **Hooks**: `useChat()` (SSE streaming, messages, permissions, cost/tokens), `useOpencode()` (server connection + client), `useSessionInit()` (session creation/persistence), `useProviderList()` (AI provider discovery + auth), `usePostTurnDiagnostics()` (post-agent validation on dirty pages), `useWorkspace()`, `useDesignSystem()`, `usePageBuild()`, `usePageExport()`, `useDocumentConfig()`, `useConnectFlow()`, `useMobile()`
- **Chat** (`components/chat/`): 4 display modes (Activity, Status, Timeline, Debug). Streams SSE from OpenCode server. Handles permissions, model selection, cost tracking. Renders hex colors as inline swatches.
- **Lib** (`src/renderer/src/lib/`): SSE message handlers, cost/token extraction, prompt templates (Mustache), chat preferences (localStorage), page auditors (overflow detection), provider actions (OAuth, API key, ping)
- **Fonts**: Fraunces (display), Inter (sans), JetBrains Mono (mono)
- **Design**: Dark mode, primary color #e8652b (orange)

### Shared Types (`src/shared/types.ts`)

Cross-process types used by main, preload, and renderer: `WorkspaceState`, `WorkspaceInfo`, `OpencodeInfo`, `UpdateState`, `ExportRequest`/`ExportProgress`, `DocumentInfo`, `DocumentConfig`, `PageInfo`, `PageSize`, `DesignSystem`/`DesignSystemToken`, `PageBuildData`, `RendererError`, `AssetEntry`

### Security

Sandbox enabled, context isolation, no nodeIntegration, CSP headers. Assets served via `litho-asset://` custom protocol with path traversal validation.

### Distribution

- **macOS**: `.dmg`
- **Windows**: `.exe` installer (NSIS)
- **Linux**: `.AppImage`, `.snap`, `.deb`
- Auto-updates via GitHub Releases (electron-updater), published to `kareemaly/lithoapp`

## Storage

### Two-Database Architecture (SQLite via better-sqlite3)

**Registry database** (`~/litho-workspaces/registry.db`) — Global workspace list. Single `workspaces` table: slug, title, created_at, last_opened_at.

**Workspace database** (`~/litho-workspaces/<slug>/workspace.db`) — Per-workspace data. Schema v3:
- `documents` — id, title, type (`normal`|`design-system`), folder, size (preset/width/height/unit), position
- `pages` — id, document_id (FK cascade), name, description, source (TSX), position
- `pages_fts` — FTS5 virtual table on page source, auto-synced via triggers
- `styles` — singleton row (id=1), css (Tailwind v4 theme + utilities)

Connection pool caches open databases by workspace name. WAL mode, foreign keys enabled, 5s busy timeout. Manual migrations via `PRAGMA user_version`.

**Assets** — Files on disk at `~/litho-workspaces/<slug>/assets/`. Allowed types: images (.png, .jpg, .jpeg, .webp, .gif, .svg), fonts (.woff2, .woff, .ttf, .otf). Served to renderer via `litho-asset://<workspace>/<path>`.

**App state** — JSON files in `app.getPath('userData')`: `active-workspace.json`, `app-preferences.json`.

## Code Style

- **Biome** for linting and formatting: single quotes, 2-space indent, 100-char line width. `components/ui/` (shadcn) is excluded from linting.
- ESM-first (`"type": "module"`)
- TypeScript strict mode, target ES2022

## Development Principles

This project is pre-release. Breaking changes are fine — there are no users to maintain backwards compatibility for. Follow best practices from the start; it's too early for tech debt.

### Simplify Relentlessly

- The simplest design that works is the best design. Remove complexity aggressively.
- Every abstraction must earn its place. If you're unsure whether to abstract, don't.
- Keep functions short and single-purpose — ideally under 20 statements.
- Keep files focused — ideally under 200-300 lines. Split when they grow beyond that.

### Fail-Fast, No Silent Errors

- Code must fail immediately when expected conditions aren't met. Silent fallbacks mask bugs.
- Throw explicit errors with clear messages explaining what failed and what was expected.
- When converting enums or union types, handle all known values explicitly and throw for unknown values.
- Surface errors to the user — no `console.error` without a corresponding toast, error state, or UI feedback.

### Separation of Concerns

- Keep business logic separate from UI components. Extract logic, calculations, and data transformations into separate files.
- UI components should orchestrate, not implement complex logic.
- Hooks should be thin wrappers around IPC/API calls and state — not containers for business rules.

### Prefer Immutability

- Don't mutate inputs; return new values.
- Use `const`, `toSorted`, object/array spreads.
- Avoid `let` — prefer creating a new function that returns the value.

### Avoid Over-Abstraction (Rule of Three)

- Wait until you have 3 instances of similar code before extracting a shared utility.
- A little duplication is better than the wrong abstraction.

### Naming Conventions

- **Files/directories**: kebab-case
- **Variables/functions**: camelCase
- **Classes/components**: PascalCase
- **Booleans**: start with `is`/`has`/`can`/`should`
- **Functions**: use verbs. Boolean-returning functions: `isX`/`hasX`/`canX`

### Exports & Imports

- Prefer named exports; avoid default exports.
- Don't create `index.ts` barrel files for internal modules — import directly from source files.

### TypeScript

- No `any`. Use `unknown` when the type is truly uncertain, then narrow it.
- Avoid type assertions (`as`) unless unavoidable.
- Let TypeScript infer return types when they're obvious.
- Use `satisfies` to check object literals match a type while preserving inference.

### Async/Await

- Any function that returns a Promise must be declared `async`.
- Always `await` async calls. Use `try/catch` for error handling, not `.then/.catch`.
- Mark intentional fire-and-forget calls with `void`.

### React & JSX

- Prefer functional, declarative components.
- Minimize `useEffect` — derive state or memoize instead.
- Break long JSX into separate components. Avoid ternary chains and inline logic with braces.
- Use `gap`/`padding` for layout spacing. Avoid margins and `space-x`/`space-y`.
- Use semantic HTML and proper accessibility patterns.
