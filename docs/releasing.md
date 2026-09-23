# Releasing

Update `package.json`, commit it, then push the matching `v<version>` tag. The release workflow
builds macOS arm64 and Windows x64 installers and publishes a GitHub prerelease with updater
metadata. Windows stays unsigned. macOS is signed and notarized with a Developer ID Application
certificate when the secrets below are configured; if they're absent, the workflow falls back to
an unsigned macOS build automatically (electron-builder's default behavior — no separate flag).

Before tagging, run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, and the local
distribution command for your platform. Release candidates do not change the updater's `latest`
channel: installed builds only offer stable updates, and users choose when to download and install.

## macOS signing and notarization setup (one-time)

Requires a **Developer ID Application** certificate in your keychain and an **App Store Connect
API key** (recommended over an Apple ID + app-specific password: it doesn't expire or need 2FA).

**1. Export the signing certificate**

Keychain Access → find your "Developer ID Application: ..." certificate → right-click → Export →
save as `certificate.p12` with a password, then:

```bash
base64 -i certificate.p12 | pbcopy
gh secret set MAC_CSC_LINK --repo lithoapp/lithoapp --body "$(pbpaste)"
gh secret set MAC_CSC_KEY_PASSWORD --repo lithoapp/lithoapp   # paste the .p12 password
```

**2. Create an App Store Connect API key**

[App Store Connect → Users and Access → Integrations → API Keys](https://appstoreconnect.apple.com/access/integrations/api)
→ create a key with the "Developer" role → download the `.p8` once (Apple won't let you re-download it).

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
gh secret set APPLE_API_KEY_P8 --repo lithoapp/lithoapp --body "$(pbpaste)"
gh secret set APPLE_API_KEY_ID --repo lithoapp/lithoapp        # the Key ID, e.g. XXXXXXXXXX
gh secret set APPLE_API_ISSUER --repo lithoapp/lithoapp        # the Issuer ID (UUID)
gh secret set APPLE_TEAM_ID --repo lithoapp/lithoapp           # your Developer Team ID
```

**3. Verify**

```bash
gh secret list --repo lithoapp/lithoapp
```

Six secrets should be listed: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_API_KEY_P8`,
`APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`. The next tagged release will sign,
notarize, and staple the macOS `.app` before it's packed into the DMG and ZIP; the workflow's
"Verify Gatekeeper acceptance" step runs `codesign --verify` and `spctl --assess` on the built
`.app` as a CI-side check. Confirm a real clean-machine Gatekeeper pass too: download the DMG from
the published release on a Mac that never trusted this cert, mount it, and launch the app without
a right-click override.

electron-updater (GitHub provider, `latest` channel) works unchanged — it doesn't care whether the
artifact is signed, but macOS Gatekeeper blocks the *install* of an unsigned update package, so
only signed releases can self-update on macOS.

**Troubleshooting:** `notarytool` returning `HTTP 403: A required agreement is missing or has
expired` means the Apple Developer account itself needs attention, not the CI config — sign in at
[App Store Connect → Agreements, Tax, and Banking](https://appstoreconnect.apple.com/agreements)
and accept the current Developer Program License Agreement.
