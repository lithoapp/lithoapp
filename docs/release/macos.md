# macOS Release Guide

## Prerequisites

### Code Signing Certificate

A **Developer ID Application** certificate is required for distribution outside the Mac App Store.

**Initial setup (done once):**

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr)
2. In Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority
3. Save the `.certSigningRequest` to disk
4. Go to [Certificates](https://developer.apple.com/account/resources/certificates/list) → click **+**
5. Select **Developer ID Application** → choose **G2 Sub-CA**
6. Upload the CSR, download the `.cer`, double-click to install in Keychain

**Verify installation:**

```bash
security find-identity -v -p codesigning
# Should show: "Developer ID Application: Kareem Elbahrawy (X22C2HTA88)"
```

**Back up the certificate:**

In Keychain Access, right-click the Developer ID Application certificate → Export as `.p12` with a strong password. Store securely (password manager, encrypted drive). This file is also used as `CSC_LINK` for CI/CD.

### Environment Variables

Add to `~/.zshrc` (never commit these):

```bash
export APPLE_ID="kareem@kareemelbahrawy.com"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="X22C2HTA88"
```

The app-specific password is generated at [account.apple.com](https://account.apple.com/) → App-Specific Passwords.

## Building

### Local build (no upload)

```bash
pnpm dist:mac
```

Produces signed `.dmg` and `.zip` in `dist/${version}/`.

### Publish to GitHub Releases

```bash
GH_TOKEN=<github-token> pnpm release:mac
```

Requires a GitHub personal access token with `repo` scope.

### Local installation (for testing)

```bash
pnpm install:mac
```

Installs the built app to `/Applications/Litho.app` and launches it.

## Artifacts

| File | Purpose |
|------|---------|
| `litho-<version>.dmg` | Installer for manual distribution |
| `Litho-<version>-arm64-mac.zip` | Used by `electron-updater` for auto-updates |
| `latest-mac.yml` | Version manifest for auto-update feed |

Artifacts are organized by version in `dist/<version>/`.

## Notarization

Notarization is currently disabled in `electron-builder.yml` (`notarize: false`). When enabled, Apple scans the app server-side — this adds 5-20 minutes to the build.

**To enable notarization**, set `notarize: true` in `electron-builder.yml` and ensure environment variables are configured.

**Check notarization status:**

```bash
xcrun notarytool history \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

**View details for a specific submission:**

```bash
xcrun notarytool info <submission-id> \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD"
```

## Auto-Updates

`electron-updater` checks GitHub Releases for `latest-mac.yml`. The `.zip` artifact is required (DMG alone is not sufficient). Auto-download is disabled — users are prompted to download and install.

## Troubleshooting

- **Keychain prompts during signing**: Enter your Mac login password. Select "Always Allow" to avoid repeated prompts.
- **Notarization rejected**: Run `xcrun notarytool log <submission-id> ...` to see the detailed rejection reasons.
- **Certificate expired/lost**: Revoke in Apple Developer portal, create a new one following the steps above.

## Reference

- **App ID**: `com.lithoapp.litho`
- **Team ID**: `X22C2HTA88`
- **Certificate**: `Developer ID Application: Kareem Elbahrawy (X22C2HTA88)`
- **Config**: `electron-builder.yml`
- **Entitlements**: `build/entitlements.mac.plist`
