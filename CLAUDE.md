# lithoapp

Electron 40 desktop application for the Litho PDF design system. React 19 + Tailwind CSS v4, built with `electron-vite`, packaged via `electron-builder`.

## Build & Development Commands

```bash
pnpm install              # Install dependencies
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

- `index.ts` — Window creation, IPC handlers, `litho-asset://` custom protocol, app lifecycle
- `ai-providers/` — AI SDK integration (see AI Architecture below)
- `renderer/` — Offline build pipeline (TSX + Tailwind → HTML): `build-csr.ts`, `build-ssr.ts`, `build-shared.ts`, `detect-approach.ts`, `loc-plugin.ts` (Babel-based `data-litho-loc` injection for edit mode), `editor-script.ts` (iframe interaction script for visual editing)
- `exporter/` — Export capture & assembly: `export-page.ts` (hidden BrowserWindow → PDF/PNG/JPG buffer), `document-exporter.ts` (multi-page orchestrator), `batch-export.ts` (CLI batch entry point)
- `workspace-data/` — SQLite-backed data layer: `db.ts` (connection pool, schema v5, migrations), `db-backend.ts` (CRUD operations), `registry-db.ts` (global workspace registry), `design-system-parser.ts` (CSS token extraction), `design-system-pages.ts` (template page definitions), `export-source.ts` (workspace ZIP export), `templates/` (Mustache templates for design system pages)
- `workspace-paths.ts` — Resolves workspace name → `{userData}/workspaces/<name>`
- `assets-manager.ts` — Workspace asset CRUD with path traversal protection
- `auto-updater.ts` — electron-updater for GitHub releases
- `feedback.ts` — App-window screenshot capture for in-app feedback attachments
- `telemetry-store.ts` — User preferences (telemetry, profile, theme)
- `sentry.ts` — Error reporting initialization and shared Sentry user sync

### AI Architecture (`src/main/ai-providers/`)

Powered by Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`). All AI logic runs in the main Electron process — no external server.

- `index.ts` — Registers IPC handlers: `chat:start`, `chat:abort`, `conversation:load/save/clear`, `ai-provider:*`
- `chat/run-chat.ts` — Streaming chat engine. `startChat()` → `runStepLoop()` (up to 50 tool-use steps) → AI SDK `streamText()` → emits `chat:delta` IPC events back to renderer
- `chat/message-mapping.ts` — Bidirectional conversion: `StoredMessage[]` ↔ AI SDK `ModelMessage[]`
- `chat/stream-events.ts` — `ChatStreamEvent` union type (text-delta, reasoning-delta, tool-call, tool-result, finish, error)
- `chat/provider-options.ts` — Per-provider `streamText` options (prompt caching, reasoning config, etc.)
- `agents/config.ts` — Agent definitions: tool allowlists, system/kickoff templates (Mustache)
- `agents/litho-tools.ts` — 11 AI SDK tools with Zod schemas, executed directly in main process
- `providers/create-model.ts` — Creates AI SDK model instances for Anthropic, OpenAI, OpenAI-compatible
- `providers/credential-store.ts` — API key / OAuth credential persistence
- `oauth/` — OAuth flows for Anthropic and OpenAI
- `db.ts` — AI-specific tables in registry.db (`ai_credentials`, `ai_models_cache`)
- `lib/replace.ts` — 9-level fuzzy string replacement engine for `editPage`/`editMainCss`
- `types.ts` — Provider, model, credential, and chat param types

### Agents (`src/agents/`)

Three AI agents with scoped tool permissions:

- **design-system** (`design-system/`) — Creative design partner for visual branding. Edits workspace `styles.css` (Tailwind v4 `@theme` block) and manages design system document pages. Has read/write access to styles and all page tools.
- **document** (`document/`) — Creative partner for building PDF pages. Reads design system styles (read-only) and manages document pages. No write access to styles.
- **workspace** (`workspace/`) — Project-level assistant for organizing documents and folders and understanding the overall project structure.

Each agent has: `system.md` (system prompt — runtime variables at top via Mustache, followed by full agent identity, instructions, and internal operating rules), `kickoff.md` (hidden first message template). Kickoff prompts now carry first-turn tool guidance; system prompts hold longer-lived behavior and scope rules. Agent configs (tool allowlists, templates) defined in `src/main/ai-providers/agents/config.ts`.

**Agent Tools** (`src/main/ai-providers/agents/litho-tools.ts`) — 16 tools exposed as AI SDK tools:
- Page tools: `listPages`, `readPage`, `writePage`, `editPage`, `createPage`, `deletePage`, `updatePageDetails`, `movePage`
- Style tools: `readMainCss`, `writeMainCss`, `editMainCss`
- Document tools: `updateDocumentDescription`, `listDocuments`, `grepPages`
- Asset tools: `listWorkspaceAssets`, `listDocumentAssets`

### Preload (`src/preload/`)

`contextBridge` exposes `window.litho` API with namespaces: `preferences`, `telemetry`, `app`, `update`, `export`, `workspace`, `document`, `designSystem`, `renderer`, `aiProvider`, `chat`, `conversation`, `feedback`, `assets`

### Renderer (`src/renderer/`)

- React 19 + Tailwind CSS v4 + shadcn/ui components (Radix UI)
- **Router**: Centralized state machine in `App.tsx` — no file-based routing. `Page` union type drives navigation.
- **Pages**: Onboarding (profile setup + provider picker), Workspaces, Documents (grid with thumbnails), Document viewer (with chat panel + page audit bar), Design System Doc (token editor + chat), Assets browser, Settings v2 (sidebar + tabs: profile, AI providers, feedback, privacy, about, advanced), Renderer POC (build/export testing)
- **Hooks**: `useChat()` (streaming via IPC `chat:delta` events, messages, cost/tokens), `useProviderList()` (AI provider discovery + auth), `usePostTurnDiagnostics()` (post-agent validation on dirty pages), `useEditMode()` (visual edit mode state, pending changes, postMessage listener, confirm/discard), `useWorkspace()`, `useDesignSystem()`, `usePageBuild()`, `usePageExport()`, `useDocumentConfig()`, `useConnectFlow()`, `useMobile()`
- **Chat** (`components/chat/`): Streams from main process via IPC events. Handles model selection, cost tracking. Renders hex colors as inline swatches.
- **Feedback** (`components/feedback/feedback-dialog.tsx`): Custom in-app Sentry feedback modal with category selection, optional email, optional app-window screenshot, and opt-out technical details. Feedback events are sent from the renderer via `Sentry.sendFeedback()`, while screenshots are captured in the main process and passed back through preload.
- **Edit Mode** (`components/edit-mode/`): Visual inline editing — users click elements in page preview iframes, make text edits inline or describe changes via floating input. Changes accumulate as pending, then compile into a structured prompt sent to the AI agent. Files: `types.ts` (PendingChange union), `pending-changes-panel.tsx` (UI panel), `compile-prompt.ts` (changes → agent prompt), `visual-edit-message.tsx` (renders visual edit messages in chat).
- **Lib** (`src/renderer/src/lib/`): SSE message handlers, cost/token extraction, prompt templates (Mustache), chat preferences (localStorage), page auditors (overflow detection), provider actions (OAuth, API key, ping), `sentry.ts` (renderer Sentry init, consent gating, feedback integration, user sync)
- **Fonts**: Fraunces (display), Inter (sans), JetBrains Mono (mono)
- **Design**: Dark mode, primary color #e8652b (orange)

### Shared Types (`src/shared/types.ts`)

Cross-process types used by main, preload, and renderer: `WorkspaceInfo`, `UpdateState`, `ExportRequest`/`ExportProgress`, `DocumentInfo`, `DocumentConfig`, `PageInfo`, `PageSize`, `DesignSystem`/`DesignSystemToken`, `PageBuildData`, `RendererError`, `AssetEntry`, `StoredMessage`/`StoredUserMessage`/`StoredAssistantMessage`/`StoredToolMessage`, `AgentId`, `AgentContext`

### Security

Sandbox enabled, context isolation, no nodeIntegration, CSP headers. Assets served via `litho-asset://` custom protocol with path traversal validation.

### Distribution

- **macOS**: `.dmg`
- **Windows**: `.exe` installer (NSIS)
- **Linux**: `.AppImage`, `.snap`, `.deb`
- Auto-updates via GitHub Releases (electron-updater), published to `kareemaly/lithoapp`
- Packaged runtime builds are split across `app.asar/node_modules` and `app.asar.unpacked/node_modules`. Native/binary lookup (e.g. `esbuild`) may need the unpacked path, but JS runtime resolution for the page build pipeline must search both locations.
- Repeated release-only `Cannot find module` / `Could not resolve` failures in startup, SSR, or visual edit mode are usually packaged dependency resolution bugs first, not page-source bugs. See `docs/release/packaged-runtime-troubleshooting.md`.

## Storage

### Two-Database Architecture (SQLite via better-sqlite3)

**Registry database** (`{userData}/workspaces/registry.db`) — Global workspace list. Single `workspaces` table: slug, title, created_at, last_opened_at.

**Workspace database** (`{userData}/workspaces/<slug>/workspace.db`) — Per-workspace data. Schema v6:
- `documents` — id, title, type (`normal`|`design-system`), folder, size (preset/width/height/unit), position
- `pages` — id, document_id (FK cascade), name, description, source (TSX), position
- `pages_fts` — FTS5 virtual table on page source, auto-synced via triggers
- `styles` — singleton row (id=1), css (Tailwind v4 theme + utilities)
- `conversations` — document_id (PK, FK cascade), messages (JSON `StoredMessage[]`), usage_input_tokens, usage_output_tokens, updated_at
- `document_snapshots` — id, document_id (FK cascade), user_message_id, pages_json, styles_css, messages_json, usage tokens, created_at. Turn-level undo: snapshots document state before each user message (max 20 per document). Revert restores pages + styles + conversation atomically.

Connection pool caches open databases by workspace name. WAL mode, foreign keys enabled, 5s busy timeout. Manual migrations via `PRAGMA user_version`.

**AI credential/cache tables** live in `registry.db` (global, not per-workspace): `ai_credentials`, `ai_models_cache`, `ai_models_dev_cache`.

**Assets** — Files on disk at `{userData}/workspaces/<slug>/assets/`. Allowed types: images (.png, .jpg, .jpeg, .webp, .gif, .svg). Served to renderer via `litho-asset://<workspace>/<path>`. Document-specific assets stored in `assets/documents/<document-id>/*` (flat, no subdirectories). The `documents` folder is reserved and hidden from the workspace assets UI.

**App state** — JSON files in `app.getPath('userData')`: `app-preferences.json`. Active workspace is tracked as local React state in the renderer (session-scoped, not persisted).

**Reset Preferences** — Available in Settings → Advanced. Clears profile, AI credentials, chat model preferences (localStorage), and app settings (theme, telemetry). Auto-reconnects free providers after clearing credentials. Triggers app relaunch and shows onboarding. Workspaces and their contents are preserved. Implementation: `telemetry-store.ts` → `resetPreferences()`, `credential-store.ts` → `clearAllCredentials()`, `models-cache.ts` → `autoConnectProviders()`.

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
