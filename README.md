# Litho

Litho is a desktop app for designing PDF-based documents with AI assistance. It's an Electron app built with React 19 and Tailwind CSS v4.

## Building from source

```
pnpm install
pnpm dev      # run in development
pnpm build    # production bundle
pnpm dist:mac # packaged app (unsigned unless you configure your own signing identity)
```

Requires Node >= 20 and pnpm. See `AGENTS.md` for the codebase layout and conventions.

### Bring your own AI provider

Litho has no built-in AI provider. Connect an API key (Anthropic, OpenAI, DeepSeek, Z.AI, etc.) or sign in with your ChatGPT/OpenAI account in Settings. Provider credentials are stored locally, encrypted via your OS keychain where available.

### Telemetry

Crash reporting via Sentry is off by default and opt-in (Settings → Privacy). It requires a `SENTRY_DSN` environment variable at build time — without one, Sentry is never initialized. See `THIRD_PARTY_NOTICES.md` for what's collected when enabled.

## Repositories

Litho's public source lives in two repositories:

- **[lithoapp](https://github.com/lithoapp/lithoapp)** (this repo) — the desktop app.
- **[litho-models](https://github.com/lithoapp/litho-models)** — the curated AI model catalogue served at `api.lithoapp.com/v1/models.json`, consumed by the app at runtime.

The marketing site, waitlist backend, release/update infrastructure, and internal eval tooling are operated by Litho and are not part of the public source release.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
