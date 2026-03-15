# Packaged Runtime Troubleshooting

## Why this keeps happening

Litho does more than load prebuilt code. In production it also:

- runs `esbuild` at runtime for page builds
- evaluates SSR bundles in the main process
- builds CSR pages for edit mode and layout analysis
- depends on Electron's packaged module layout

That makes releases more fragile than dev. In dev, everything resolves from one normal `node_modules` tree. In packaged apps, dependencies can be split between:

- `app.asar/node_modules`
- `app.asar.unpacked/node_modules`

Native binaries usually need the unpacked path. Normal JS packages may still live inside `app.asar`. Bugs appear when runtime code assumes everything is in one location.

## Common symptom pattern

These failures often look like one of the following:

- startup crash with `Cannot find module '<package>'`
- visual editing fails only in packaged builds
- SSR works in dev but fails in packaged app
- CSR edit mode fails with `Could not resolve '<package>'`
- React hook crash such as `Cannot read properties of null (reading 'useContext')`

If it works in `pnpm dev` but breaks in `pnpm dist:mac` or Windows installers, suspect packaged runtime resolution first.

## Known recurring cases

### 1. Duplicate React runtime during SSR

Symptom:

```text
Cannot read properties of null (reading 'useContext')
```

Cause:

- the evaluated SSR page bundle loaded one React instance
- `renderToStaticMarkup` used a different React instance
- hooks ran against the wrong dispatcher

Fix applied:

- `src/main/renderer/build-ssr.ts` now loads `react` and `react-dom/server` through the same resolver used by the evaluated bundle

### 2. Missing `module-details-from-path` on startup

Symptom:

```text
Error: Cannot find module 'module-details-from-path'
Require stack:
- require-in-the-middle
- @opentelemetry/instrumentation
- @sentry/electron
```

Cause:

- startup telemetry path loaded Sentry/OpenTelemetry
- transitive dependency packaging was incomplete for the packaged app layout

Fix applied:

- promoted `module-details-from-path` to a direct dependency in `package.json`

Notes:

- this may only show up when telemetry is enabled
- it can stay hidden for a while if local test installs have telemetry off

### 3. Missing `scheduler` during CSR page builds

Symptom:

```text
Syntax error in <page>
Could not resolve "scheduler"
```

Usually seen from:

- visual edit mode
- packaged CSR page builds

Cause:

- runtime `esbuild` resolved dependencies from the wrong packaged location
- `react-dom/client` was available, but its dependency `scheduler` was not in the same resolution path

Fix applied:

- `src/main/lib/paths.ts` now distinguishes binary lookup from JS module resolution
- runtime JS resolution now checks both packaged module locations
- `scheduler` was promoted to a direct dependency in `package.json`

## Current rules of thumb

- if the failing package is a normal JS dependency, do not assume it will be next to unpacked binaries
- if the failing package is used by runtime `esbuild`, SSR eval, or CSR edit mode, test the packaged app specifically
- if a transitive dependency is repeatedly missing in packaged builds, promote it to a direct dependency
- keep binary lookup and JS module resolution separate
- never trust dev-mode success as proof that packaged builds are safe

## Files involved most often

- `src/main/lib/paths.ts`
- `src/main/index.ts`
- `src/main/renderer/build-shared.ts`
- `src/main/renderer/build-csr.ts`
- `src/main/renderer/build-ssr.ts`
- `electron-builder.yml`
- `package.json`

## Release debugging checklist

When a release-only error appears:

1. Confirm whether it happens in dev or only in a packaged app.
2. Check whether the failure is startup, SSR, CSR, or export.
3. Inspect whether the missing package exists in:
   - `app.asar`
   - `app.asar.unpacked`
4. Check whether the failing code path uses custom module resolution.
5. If the missing package is transitive and repeatedly required at runtime, add it as a direct dependency.
6. Re-test on the packaged app, not just local dev.

## Suggested smoke tests before release

- app startup with telemetry enabled
- open a document
- build a normal page
- enter visual edit mode
- run an SSR-backed layout analysis path
- export at least one document/page

## Short version

Most of these release bugs are not random. They come from the same root issue: Litho performs runtime build work inside a packaged Electron app, and packaged dependency resolution is split across `app.asar` and `app.asar.unpacked`.
