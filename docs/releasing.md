# Releasing

Update `package.json`, commit it, then push the matching `v<version>` tag. The release workflow
builds unsigned macOS arm64 and Windows x64 installers and publishes a GitHub prerelease with
updater metadata. No repository secrets are required; Actions uses its scoped `GITHUB_TOKEN`.

Before tagging, run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, and the local
distribution command for your platform. Release candidates do not change the updater's `latest`
channel: installed builds only offer stable updates, and users choose when to download and install.
