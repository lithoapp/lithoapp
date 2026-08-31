# Third-Party Notices

Litho is built with open-source dependencies (see `package.json`). This file
covers items with additional attribution or usage notes beyond their
package-level license.

| Component | License | Notes |
|---|---|---|
| [`@lobehub/icons`](https://github.com/lobehub/lobe-icons) | MIT | Bundled brand icons for AI providers (OpenAI, Anthropic, etc.). Marks remain property of their respective owners; used to identify provider integrations. |
| [`@fontsource-variable/fraunces`](https://fonts.google.com/specimen/Fraunces), `inter`, `jetbrains-mono` | SIL OFL 1.1 | Self-hosted Google Fonts. |
| `patches/@ai-sdk__openai@2.0.89.patch` | Apache-2.0 (upstream) | Small patch against Vercel's [`ai-sdk`](https://github.com/vercel/ai) `@ai-sdk/openai` package, applied via pnpm patch. |
| [`@sentry/electron`](https://github.com/getsentry/sentry-electron) | MIT | Optional, opt-in crash reporting. Disabled unless a `SENTRY_DSN` is set at build time; no default PII, query strings stripped from breadcrumbs, user name/email attached only if telemetry is on and the user set a profile. |

## OAuth client identity

Litho's ChatGPT/OpenAI OAuth integration reuses OpenAI's published Codex CLI
OAuth client ID — a public PKCE client with no associated secret — the same
pattern used by other third-party Codex-integrated tools. Requests identify
themselves as `litho` (see `src/main/ai-providers/oauth/client-identity.ts`),
not as OpenAI's own CLI.
