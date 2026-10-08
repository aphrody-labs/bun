# Aphrody kernel

`aphrody-labs/bun` is the Bun of Aphrody: every Bun change Aphrody needs lands here as a commit on `main`.
The Aphrody monorepo keeps no Bun patch queue, no vendored Bun tree and no Rust copy of Bun code.

What Aphrody consumes from this repository:

| Artifact | Source here | Consumer in Aphrody |
| --- | --- | --- |
| Runtime binary | `aphrody-v*` GitHub releases, npm `@aphrody/bun-runtime` (`.github/workflows/aphrody-release.yml`, `scripts/aphrody/publish-runtime.ts`) | Bun version pin (`tools/config/update/pins.json` follows these releases) |
| Installers | `scripts/aphrody/install.sh`, `scripts/aphrody/install.ps1` (`latest`, base `X.Y.Z` or a release tag; SHA256 checked) | every Bun install of Aphrody: bootstrap, Docker images, `yolo update`, hosts |
| Types and tooling packages | npm `@aphrody/bun-types`, `@aphrody/bun-inspector-protocol`, … (`scripts/aphrody/publish-npm.ts`) | workspaces |
| Rust crates | crates.io `aphrody-bun-native-plugin`, `aphrody-bun-macro` (`scripts/aphrody/publish-crates.ts`) | native plugins |
| Documentation | `docs/` | `docs/reference/upstream-bun` (`bun run docs:bun:update`), MCP `bun_docs_*` |
| Source checkout | `APHRODY_BUN_CHECKOUT`, else `C:\bun` on Windows | MCP `bun_docs_*`, training corpora |

Upstream `oven-sh/bun` arrives by merge only: `bun scripts/aphrody/sync-upstream.ts` (also run every 6 hours by
`.github/workflows/aphrody-upstream-sync.yml`). Fork-only tests live in `test/js/first_party/`.
