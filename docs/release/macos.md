# macOS Release Process

This is the current manual macOS release flow for Litho.

Use this exact order for every new mac release.

## 1. Bump the app version

Update the version in `package.json` first.

Example:

```json
{
  "version": "1.0.0-beta.3"
}
```

The build output path and artifact names come from that version.

## 2. Build the mac release

```bash
pnpm dist:mac
```

This creates the signed mac artifacts in:

```bash
dist/<version>/
```

Important artifact for distribution:

- `dist/<version>/litho-<version>.dmg`

## 3. Smoke test the built app locally

```bash
pnpm install:mac
```

This removes `/Applications/Litho.app`, copies the built app from `dist/<version>/mac-arm64/Litho.app` into `/Applications`, and opens it.

This is a local sanity check, not a full real-user download test.

## 4. Notarize the DMG

```bash
xcrun notarytool submit "./dist/<version>/litho-<version>.dmg" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
```

If notarization fails, inspect the rejection log:

```bash
xcrun notarytool log "<submission-id>" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

## 5. Staple the notarization ticket to the DMG

```bash
xcrun stapler staple "./dist/<version>/litho-<version>.dmg"
```

## 6. Validate the stapled DMG

```bash
xcrun stapler validate "./dist/<version>/litho-<version>.dmg"
```

## 7. Publish the DMG

Upload the stapled DMG to the website or beta distribution channel.

Current recommendation:

- distribute the `.dmg` for macOS
- do not distribute an unstapled artifact
- do not publish a GitHub Release as part of the default macOS release flow

## Required environment variables

These must exist in the shell before notarization:

```bash
export APPLE_ID="kareem@kareemelbahrawy.com"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="X22C2HTA88"
```

## Release checklist

1. Update `package.json` version.
2. Run `pnpm dist:mac`.
3. Run `pnpm install:mac`.
4. Notarize the DMG with `xcrun notarytool submit ... --wait`.
5. Staple the DMG.
6. Validate the DMG.
7. Upload the final DMG.

## Notes for future agents

- `electron-builder.yml` currently has `notarize: false`, so notarization is manual.
- The canonical release artifact for direct mac download is the DMG at `dist/<version>/litho-<version>.dmg`.
- Do not publish a GitHub Release unless there is a separate explicit need for it.
- `pnpm install:mac` is only a local smoke test.
- A real download/install test on another Mac is still recommended before broad release.
