# Release Process

This is the release flow for Litho. Mac and Windows are released together from the same version bump.

Use this exact order for every release.

## 1. Bump the app version

Update the version in `package.json`:

```json
{
  "version": "1.0.0-beta.4"
}
```

The build output path and artifact names come from that version.

## 2. Build for both platforms

```bash
pnpm dist:mac   # macOS: signed DMG + ZIP
pnpm dist:win   # Windows: signed x64 + arm64 NSIS installers
```

Artifacts land in `dist/<version>/`.

## 3. Smoke test the mac build locally

```bash
pnpm install:mac
```

This removes `/Applications/Litho.app`, copies the built app from `dist/<version>/mac-arm64/Litho.app` into `/Applications`, and opens it.

This is a local sanity check, not a full real-user download test.

## 4. Wait for explicit user confirmation

**STOP HERE.** After running `pnpm install:mac`, you MUST wait for the user to open and verify the locally installed app before proceeding. Do NOT proceed to notarization until the user explicitly confirms the build is good.

## 5. Notarize the macOS DMG

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

## 6. Staple the notarization ticket to the DMG

```bash
xcrun stapler staple "./dist/<version>/litho-<version>.dmg"
```

## 7. Validate the stapled DMG

```bash
xcrun stapler validate "./dist/<version>/litho-<version>.dmg"
```

## 8. Publish all artifacts via litho-releases

Run the publish script from the `litho-releases` repo. It uploads the macOS DMG and both Windows installers (x64 + arm64), records the release in DynamoDB, and the API immediately serves the updated `latest-mac.yml` and `latest.yml` feeds to electron-updater.

```bash
cd ~/litho/litho-releases && \
  AWS_REGION=us-east-1 \
  LITHO_RELEASES_RELEASE_BUCKET_NAME=releases-api-lithoapp-com \
  LITHO_RELEASES_TABLE_NAME=releases-api-lithoapp-com-core \
  npm run build:publish -- \
    --version <version> \
    --channel release \
    --status published
```

Verify the endpoints are live after upload:

```bash
curl -s -H "x-api-key: <api-key>" https://releases-api.lithoapp.com/v1/updates/latest-mac.yml
curl -s -H "x-api-key: <api-key>" https://releases-api.lithoapp.com/v1/updates/latest.yml
```

Both should return the new version.

## Required environment variables

### macOS notarization

```bash
export APPLE_ID="kareem@kareemelbahrawy.com"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="X22C2HTA88"
```

### litho-releases publish

AWS credentials must be active in the shell (`aws sts get-caller-identity` should succeed). Bucket and table names are hardcoded in the command above — get them from `terraform output` in `~/litho/litho-releases/terraform` if they ever change.

## Release checklist

1. Update `package.json` version.
2. Run `pnpm dist:mac`.
3. Run `pnpm dist:win`.
4. Run `pnpm install:mac`.
5. **Wait for explicit user confirmation** that the build is good.
6. Notarize the DMG with `xcrun notarytool submit ... --wait`.
7. Staple the DMG.
8. Validate the DMG.
9. Publish via `npm run build:publish` in `~/litho/litho-releases`.
10. Verify `latest-mac.yml` and `latest.yml` return the new version.

## Notes for future agents

- `electron-builder.yml` has `notarize: false` — notarization is manual (step 6 above).
- The `publish` config in `electron-builder.yml` has `channel: latest` — this forces the channel file to be `latest-mac.yml` (not `beta-mac.yml`), which matches what the releases API serves.
- Windows builds are cross-compiled from macOS via `pnpm dist:win` — no Windows machine needed.
- The publish script uploads the macOS DMG and both Windows EXEs — the API generates the update feed from stored metadata.
- The canonical macOS artifact for direct download is `dist/<version>/litho-<version>.dmg` (post-staple).
- The canonical Windows artifacts are `dist/<version>/litho-<version>-x64-setup.exe` and `dist/<version>/litho-<version>-arm64-setup.exe`.
- `pnpm install:mac` is only a local smoke test — a real download test on another Mac is still recommended before broad release.
