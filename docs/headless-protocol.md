# Litho Headless Protocol — litho-lab integration guide

This document is the canonical reference for integrating **litho-lab** with
lithoapp's headless mode. It assumes litho-lab is spawning lithoapp as a
subprocess for eval runs and needs to drive agents end-to-end while keeping
its state fully isolated from any locally installed Litho.

If you want to understand the protocol as-designed before writing code:
read this document top to bottom, then skim the source files listed under
[Source-of-truth references](#source-of-truth-references). The smoke test at
the bottom of this document is a working end-to-end example that's been run
against a real build with a real model.

## TL;DR

```
electron out/main/index.js --headless --workspaces-root /path/to/isolated/dir
```

- Speaks **newline-delimited JSON-RPC 2.0** over stdio. One process per eval
  invocation. Exits on stdin close or `shutdown`.
- stdout = JSON-RPC frames. stderr = structured log lines. Never mix.
- The isolated workspaces root contains `registry.db` (credentials,
  workspace list, model cache) **and** each `<workspaceId>/workspace.db`.
  Fresh on every run — no leakage from the developer's installed app.
- litho-lab **owns credential injection**. Call `provider.setCredential`
  during setup with keys managed by your secret source of truth. Do not
  rely on environment variables or copied registry files.

## Credentials model

On startup with `--workspaces-root`, a fresh `registry.db` is created
inside that directory. The AI credential store starts **empty**. Every
provider (`anthropic`, `openai`, `deepseek`, `zai-coding-plan`, …) will
fail any `agent.run` call with a credential-not-found error until you
inject keys.

The correct flow is:

1. `initialize` — wait for the models cache to be ready.
2. `provider.setCredential` — once per real provider you intend to use,
   with a `Credential` object (see [`src/main/ai-providers/types.ts`](../src/main/ai-providers/types.ts)
   for the exact `CredentialApi` / `CredentialOAuth` union).
3. Everything else.

To confirm what's connected after `initialize`, call `provider.list` — the
`connected` field lists every provider with a credential, which on a fresh
root is empty.

**Do not** copy the installed app's `registry.db` into the workspaces root
as a shortcut. SQLite WAL mode means a plain copy misses uncommitted writes
in the `-wal` sidecar, and you'd be mixing dev state into eval runs. The
credential injection path is the only supported mechanism.

Example credential payloads:

```jsonc
// API key
{ "type": "api", "key": "sk-..." }

// OAuth (e.g. Anthropic/OpenAI Codex) — carry-through from an existing session
{ "type": "oauth", "refresh": "...", "access": "...", "expires": 1700000000 }
```

If you need to perform the OAuth flow yourself, do it outside the headless
process. Headless mode does not expose the interactive OAuth handlers that
the in-app UI uses — see [`src/main/ai-providers/oauth/`](../src/main/ai-providers/oauth/)
for the implementation you'd replicate.

## Source-of-truth references

Read these before implementing. The documentation below summarizes what they
contain, but the code is authoritative and will drift first.

| What you need to know | File |
|---|---|
| Full RPC method wiring (every `dispatcher.register` call) | [`src/main/headless/index.ts`](../src/main/headless/index.ts) |
| Transport & error codes | [`src/main/headless/json-rpc.ts`](../src/main/headless/json-rpc.ts) |
| Exact params/results for every handler | [`src/main/headless/services/`](../src/main/headless/services/) |
| `Credential` type for `provider.setCredential` | [`src/main/ai-providers/types.ts`](../src/main/ai-providers/types.ts) |
| `ChatStreamEvent` union — one-to-one with `run.*` notifications | [`src/main/ai-providers/chat/stream-events.ts`](../src/main/ai-providers/chat/stream-events.ts) |
| `AgentContext` shape for `agentContextOverrides` | [`src/shared/types.ts`](../src/shared/types.ts) (search `AgentContext`) |
| `StoredMessage` union returned in `run.finish.messages` | [`src/shared/types.ts`](../src/shared/types.ts) (search `StoredMessage`) |
| `PageSize` / `PageSizeName` / `PAGE_SIZES` | [`src/shared/types.ts`](../src/shared/types.ts) |
| Agent IDs and their tool permissions | [`src/main/ai-providers/agents/config.ts`](../src/main/ai-providers/agents/config.ts) |
| System + kickoff prompt templates (Mustache) | [`src/agents/<agentId>/system.md`](../src/agents/), [`kickoff.md`](../src/agents/) |
| `TemplateId` enum (`'minimal' \| 'corporate' \| 'brightside' \| 'editorial'`) | [`src/main/workspace-data/design-system-pages.ts`](../src/main/workspace-data/design-system-pages.ts) |
| Prompt rendering (where `run.start` fields come from) | [`src/main/ai-providers/chat/run-chat.ts`](../src/main/ai-providers/chat/run-chat.ts) + [`agents/config.ts`](../src/main/ai-providers/agents/config.ts) |

## Transport

- **stdin** — newline-delimited JSON-RPC 2.0 requests. One JSON object per
  line. No batching.
- **stdout** — newline-delimited JSON-RPC 2.0 responses and notifications.
  Nothing else is ever written here. Any stray `console.log` from
  dependencies is intercepted and redirected to stderr.
- **stderr** — structured JSON log lines: `{ ts, level, message, meta? }`.
  Safe to parse, safe to ignore.

litho-lab's reader loop should split stdout on `\n`, `JSON.parse` each line,
and demultiplex on `id` (response) vs. `method` (notification). A reference
implementation of this transport is at [`src/mcp-wrapper/index.ts`](../src/mcp-wrapper/index.ts)
— it's the MCP stdio shim, but the stdio framing is identical.

## Lifecycle

```
litho-lab                           lithoapp (headless)
  │                                   │
  │── initialize ───────────────────▶│  waits for models cache
  │◀─── { version, agents, ... } ────│
  │── provider.setCredential ──────▶│  one per provider you'll use
  │◀─── {} ──────────────────────────│
  │── workspace.create ─────────────▶│
  │◀─── { workspaceId, path, designSystemDocId } ──│
  │── document.create ──────────────▶│
  │◀─── { documentId } ──────────────│
  │── agent.run ────────────────────▶│  returns immediately
  │◀─── { runId } ───────────────────│
  │◀── run.start ────────────────────│  rendered prompts + agentContext
  │◀── run.textDelta / reasoningDelta│
  │◀── run.toolCall / toolResult ────│  unpruned tool output
  │◀── run.stepUsage ────────────────│  per-step, not just final
  │◀── run.finish ───────────────────│  { finishReason, totalUsage, messages }
  │── document.export ──────────────▶│
  │◀─── { files } ───────────────────│
  │── workspace.delete ─────────────▶│  cleanup
  │◀─── {} ──────────────────────────│
  │── shutdown ─────────────────────▶│
  │◀─── {} ──────────────────────────│
  (process exits)
```

`initialize` **must** be the first call. `waitForModelsReady()` is awaited
inside it, so until it returns you cannot rely on `provider.listModels` or
`agent.run` to know what's available.

## Requests

### Lifecycle

| Method | Params | Result |
|---|---|---|
| `initialize` | `{}` | `{ version: string, agents: AgentId[], supportedFormats: ExportFormat[], templates: TemplateId[] }` |
| `shutdown` | `{}` | `{}` — process exits shortly after the response is flushed |

`shutdown` is graceful. If litho-lab instead closes stdin, the process also
shuts down cleanly (`closeAllDbs` runs either way).

### Providers

| Method | Params | Result |
|---|---|---|
| `provider.setCredential` | `{ providerId: string, credential: Credential }` | `{}` |
| `provider.list` | `{}` | `{ providers: ProviderInfo[], connected: string[] }` |
| `provider.listModels` | `{ providerId: string }` | `{ models: ModelInfo[] }` |

`providerId` values must match what `provider.list` returns. At time of
writing that's `'anthropic'`, `'openai'`, `'deepseek'`, `'zai-coding-plan'` — but
don't hardcode; call `provider.list` and iterate. The authoritative list
comes from `https://api.lithoapp.com/v1/models.json`, cached in `registry.db`
and refreshed at startup.

### Workspaces

| Method | Params | Result |
|---|---|---|
| `workspace.create` | `{ name: string, title?: string, templateId?: TemplateId }` | `{ workspaceId: string, path: string, designSystemDocId: string }` |
| `workspace.open` | `{ path: string }` | `{ workspaceId: string, title: string }` |
| `workspace.list` | `{}` | `{ workspaces: WorkspaceInfo[] }` — each entry includes `designSystemDocId: string` |
| `workspace.close` | `{ workspaceId: string }` | `{}` |
| `workspace.delete` | `{ workspaceId: string }` | `{}` — closes the DB, removes the registry row, deletes the directory recursively |

Notes on `workspace.create`:

- `name` is the caller-facing label; `title` defaults to `name`.
- **The `workspaceId` returned is a slug derived from `title`**, not `name`
  as-passed. If you pass `title: "Eval Run 42"`, you get `workspaceId:
  "eval-run-42"`. litho-lab should treat the returned `workspaceId` as the
  opaque identifier and use it in every subsequent call.
- `templateId` selects a built-in design-system template. The list is
  returned from `initialize.templates`. Defaults to `'minimal'`. All
  templates work for agent runs — the choice affects the starting CSS
  tokens and design-system document pages only.
- `designSystemDocId` — the workspace's design-system document, auto-created
  by lithoapp at workspace creation time. Required as `documentId` when
  calling `agent.run` with `agentId: 'design-system'`. Capture this from
  `workspace.create` and reuse it across the workspace's lifetime. Also
  available per-entry from `workspace.list` for cases where the create-time
  value wasn't persisted.

### Documents

| Method | Params | Result |
|---|---|---|
| `document.create` | `{ workspaceId, title, size: PageSizeName \| PageSize, folder? }` | `{ documentId: string }` |
| `document.updateSize` | `{ workspaceId, documentId, size }` | `{}` — throws if the document already has pages |
| `document.list` | `{ workspaceId }` | `{ documents: DocumentInfo[] }` — includes both `'normal'` and `'design-system'` entries; use the `type` field to identify the design-system document |
| `document.export` | `{ workspaceId, documentId, format: 'pdf'\|'png'\|'jpg', outputPath: string }` | `{ files: string[] }` |

`size` accepts either a preset name (`'A4'`, `'Letter'`, ...) or an explicit
`{ width, height, unit }` object. See `PAGE_SIZES` in
[`src/shared/types.ts`](../src/shared/types.ts) for the full list.

`document.export` uses lithoapp's existing `DocumentExporter` pipeline —
each page is built via the offline TSX→HTML pipeline and rendered through a
hidden `BrowserWindow` for capture. Works headlessly, no display required.

Output semantics (one file per call, always written to `outputPath`):

- `format: 'pdf'` → a single merged PDF containing every page.
- `format: 'png'` or `'jpg'`, single-page document → a single image file.
- `format: 'png'` or `'jpg'`, multi-page document → a ZIP archive of
  `page-1.{png,jpg}`, `page-2.{png,jpg}`, … at `outputPath`.

Per-page file output is not currently supported. If litho-lab needs
individual page files, the simplest path is to request PNG/JPG and unzip
the result.

### Conversations

| Method | Params | Result |
|---|---|---|
| `conversation.save` | `{ workspaceId, documentId, messages: StoredMessage[], usage: { inputTokens, outputTokens } }` | `{}` |

Persists the conversation history for a document. In GUI mode the renderer
calls this automatically after each turn; in headless mode the client is
responsible for calling it after `run.finish` with the `messages` array from
that event.

### Agent runs

| Method | Params | Result |
|---|---|---|
| `agent.run` | `{ workspaceId, documentId?, agentId, modelId, providerId, userMessage, agentContextOverrides? }` | `{ runId: string }` |
| `agent.abort` | `{ runId: string }` | `{}` |

`agent.run` returns **immediately** with a `runId`. The actual run progress
is streamed as `run.*` notifications correlated by that `runId`. Do not
block on the response — start consuming notifications as soon as the
response arrives.

Parameter details:

- `agentId` — one of `'design-system'`, `'document'`, `'workspace'`. Each
  has a different tool allowlist. Pick `'document'` for most page-authoring
  evals. See [`src/main/ai-providers/agents/config.ts`](../src/main/ai-providers/agents/config.ts).
- `documentId` — required for `'document'` and `'design-system'` agents,
  ignored for `'workspace'`. Controls which document the agent is scoped to.
- `modelId` — exact model ID from `provider.listModels`. E.g.
  `'claude-sonnet-4-6'`, `'gpt-5.2-codex'`. Must match the provider's
  advertised list.
- `providerId` — must have a credential set via `provider.setCredential`
  first.
- `userMessage` — the turn the agent sees as the user. The agent's kickoff
  prompt is rendered automatically and inserted as a hidden first turn
  before this message.
- `agentContextOverrides` — **rarely needed**. The default `AgentContext`
  is derived from the workspace + document state (title, size, etc.). Only
  override if you're doing something unusual like faking a `userName` or
  pointing the agent at a different design-system document. See the
  `AgentContext` interface in [`src/shared/types.ts`](../src/shared/types.ts).

`agent.abort` signals the underlying `AbortController`. If the model has
already started streaming a turn, partial tool calls/results up to that
point are still included in the final `run.finish` notification with
`finishReason: "abort"`.

## Notifications

All run notifications carry `runId` for correlation. The JSON-RPC envelope
is `{ "jsonrpc": "2.0", "method": "<name>", "params": { ... } }` with no
`id` field.

| Method | Params | When it fires |
|---|---|---|
| `run.start` | `{ runId, agentId, modelId, providerId, systemPromptRendered, kickoffPromptRendered, agentContext, userMessage, startedAt }` | Once per run, before any model call. `systemPromptRendered` and `kickoffPromptRendered` are the fully Mustache-rendered strings the agent actually saw — persist these to make debug-view replay faithful. |
| `run.textDelta` | `{ runId, text }` | Streaming assistant text tokens. |
| `run.reasoningDelta` | `{ runId, text }` | Thinking-block tokens. Full fidelity, no truncation. |
| `run.toolCall` | `{ runId, toolCallId, toolName, input }` | Agent invoked a tool. |
| `run.toolResult` | `{ runId, toolCallId, toolName, output }` | Tool returned. **The output is the full, unpruned result.** lithoapp separately applies result-pruning to the model history on subsequent steps (`src/main/ai-providers/chat/prune-tool-results.ts`), but the notification stream always carries the raw output so debug views can replay everything. |
| `run.stepUsage` | `{ runId, step, usage: { inputTokens, outputTokens, reasoningTokens, cacheReadTokens, cacheWriteTokens } }` | At the end of each step. `step` is 1-indexed. A single turn may have many steps (one per tool-use round-trip). |
| `run.finish` | `{ runId, finishReason, totalUsage, durationMs, messages }` | Once per run. `messages` is the `StoredMessage[]` produced by this turn — suitable for persisting as the conversation history. |
| `run.error` | `{ runId, error: { type, message } }` | Terminal error. Mutually exclusive with `run.finish`. |
| `log` | `{ level, message, meta? }` | Optional diagnostic breadcrumbs. Safe to ignore. |

The mapping between `ChatStreamEvent` (in the source) and these
notifications is one-to-one with a `run.` prefix — if you need to add a new
event type, that's where it lives.

## Errors

Responses to requests follow standard JSON-RPC 2.0 error envelopes:

| Code | Meaning |
|---|---|
| `-32700` | Parse error — request line was not valid JSON |
| `-32600` | Invalid request — missing `jsonrpc: "2.0"` or `method` |
| `-32601` | Method not found |
| `-32602` | Invalid params — required fields missing or malformed |
| `-32603` | Internal error — the handler threw. `error.data.stack` is populated when `--log-level=debug`. |

An `agent.run` that fails *after* returning a `runId` emits `run.error`
rather than erroring the original request.

## Example session

A working version of this flow has been run end-to-end against a real build
with model `gpt-5.2-codex`. Exit code 0, `finishReason: "stop"`,
`durationMs: 8103`, 2 step-usage events, 5 tool calls, and a final text
response of `"Hello."`.

```jsonc
// → initialize
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
// ← { version: "0.1.0", agents: [...], supportedFormats: [...], templates: ["minimal","corporate","brightside","editorial"] }

// → set credentials (litho-lab manages these, not lithoapp)
{"jsonrpc":"2.0","id":2,"method":"provider.setCredential","params":{"providerId":"openai","credential":{"type":"api","key":"sk-..."}}}

// → create isolated workspace
{"jsonrpc":"2.0","id":3,"method":"workspace.create","params":{"name":"eval-run-42","title":"Eval Run 42","templateId":"minimal"}}
// ← { workspaceId: "eval-run-42", path: "/tmp/litho-eval/eval-run-42", designSystemDocId: "..." }

// → create document
{"jsonrpc":"2.0","id":4,"method":"document.create","params":{"workspaceId":"eval-run-42","title":"Cover","size":"A4"}}
// ← { documentId: "pqDOJUS4yjwz" }

// → run agent
{"jsonrpc":"2.0","id":5,"method":"agent.run","params":{
  "workspaceId":"eval-run-42",
  "documentId":"pqDOJUS4yjwz",
  "agentId":"document",
  "providerId":"openai",
  "modelId":"gpt-5.2-codex",
  "userMessage":"Add a title page with the heading 'Quarterly Review'"
}}
// ← { runId: "bfe6bf8d-..." }
// ← run.start { runId, systemPromptRendered: "...", kickoffPromptRendered: "...", agentContext, ... }
// ← run.reasoningDelta × N
// ← run.toolCall { toolName: "listDocuments", ... }
// ← run.toolResult { toolName: "listDocuments", output: "..." }
// ← run.toolCall { toolName: "createPage", ... }
// ← run.toolResult { toolName: "createPage", output: "..." }
// ← run.stepUsage { step: 1, usage: { inputTokens, outputTokens, ... } }
// ← run.textDelta × N
// ← run.stepUsage { step: 2, usage: { ... } }
// ← run.finish { finishReason: "stop", totalUsage, durationMs, messages: [...] }

// → export
{"jsonrpc":"2.0","id":6,"method":"document.export","params":{
  "workspaceId":"eval-run-42",
  "documentId":"pqDOJUS4yjwz",
  "format":"pdf",
  "outputPath":"/tmp/litho-eval/out.pdf"
}}
// ← { files: ["/tmp/litho-eval/out.pdf"] }

// → teardown
{"jsonrpc":"2.0","id":7,"method":"workspace.delete","params":{"workspaceId":"eval-run-42"}}
// ← {}

// → shutdown
{"jsonrpc":"2.0","id":8,"method":"shutdown","params":{}}
// ← {}
// (process exits)
```

## Things to watch out for

- **`agent.run` responds before streaming begins.** Don't synchronously
  wait for the response and then start reading notifications — you'll miss
  events. Start consuming stdout from the moment you spawn the process.
- **Credentials do not survive across process invocations by default.**
  The isolated `registry.db` lives inside `--workspaces-root`. If you reuse
  the same root across runs, credentials persist; if you use a fresh root,
  you must re-inject on every spawn. litho-lab should prefer fresh roots
  per eval to keep state hermetic.
- **`workspace.create` slugifies the `title`, not the `name`.** Use the
  returned `workspaceId` for everything downstream. Don't construct the
  slug yourself.
- **The models cache is network-fetched at startup.** `initialize` awaits
  this, so the first call may take a few hundred ms on a cold start. After
  the cache is populated in `registry.db` it's reused for subsequent runs
  against the same workspaces root (with a background refresh).
- **`run.finish.messages`** is the canonical conversation history for
  persistence. It's a `StoredMessage[]` with reasoning parts stored but not
  sent back to the model on subsequent turns (see `message-mapping.ts`).
  Good for debug-view replay; use as-is.
- **Vision tool results are pruned from model history but not from
  notifications.** The `run.toolResult` stream carries the full inline
  image content; lithoapp's `prune-tool-results.ts` strips them before the
  next model call. If you're counting tokens from notifications you'll
  overcount vs. what actually hits the model.
- **stdout discipline is load-bearing.** If anything writes to stdout that
  isn't a JSON-RPC frame, your reader will blow up. The headless bootstrap
  redirects `console.*` to stderr precisely for this reason — if you find
  stray output, file it as a bug, don't work around it.

## Stability

This protocol is versioned via `initialize.version`, currently `0.1.0`, and
is considered **unstable**. Request shapes, notification shapes, and the
exact set of methods may change. Pin litho-lab to a specific lithoapp build
and upgrade deliberately. When we cut a 1.0.0, this section will change.
