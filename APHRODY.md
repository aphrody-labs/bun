# Aphrody runtime: role, governance and releases

## Role in Aphrody

`aphrody-labs/bun` is the runtime component of Aphrody. Every runtime change Aphrody needs is made in this
repository, as a commit on `main`. The Aphrody product repository (`aphrody-labs/aphrody`) has no Bun patch queue,
no vendored copy of Bun and no Rust copy of Bun code. It uses the artifacts below.

The runtime also owns the system layer. That covers Windows and Linux APIs, FFI, native libraries, the system Rust
crates, and .NET, C and C++ interop. The product consumes this layer; it does not keep its own copy
([docs/aphrody/LAYERS.md](docs/aphrody/LAYERS.md)).

| Artifact                   | Source in this repository                                                                                                                                      | Consumer in Aphrody                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Runtime binary             | `aphrody-v*` GitHub releases; npm `@aphrody/bun-runtime` ([`scripts/aphrody/publish-runtime.ts`](scripts/aphrody/publish-runtime.ts))                          | the distribution's Bun pin (`tools/config/update/pins.json` follows these releases)       |
| Installers                 | [`scripts/aphrody/install.sh`](scripts/aphrody/install.sh), [`install.ps1`](scripts/aphrody/install.ps1), served as `aphrody.com/install.sh` and `install.ps1` | every runtime install in Aphrody: bootstrap, Docker images, `yolo update`, hosts          |
| Container image            | `ghcr.io/aphrody-labs/bun` (private), from [`scripts/aphrody/deploy/docker/`](scripts/aphrody/deploy/docker)                                                   | build and production hosts ([docs/project/auto-deploy.mdx](docs/project/auto-deploy.mdx)) |
| Types and tooling packages | npm `@aphrody/bun-types`, `@aphrody/bun-inspector-protocol`, … ([`scripts/aphrody/publish-npm.ts`](scripts/aphrody/publish-npm.ts))                            | workspaces                                                                                |
| Rust crates                | crates.io `aphrody-bun-native-plugin`, `aphrody-bun-macro` ([`scripts/aphrody/publish-crates.ts`](scripts/aphrody/publish-crates.ts))                          | native plugins                                                                            |
| Documentation              | [`docs/`](docs), published at [aphrody.com/docs](https://aphrody.com/docs) by [`scripts/aphrody/site/`](scripts/aphrody/site)                                  | `docs/reference/upstream-bun` (`bun run docs:bun:update`), MCP `bun_docs_*`               |
| Source checkout            | `APHRODY_BUN_CHECKOUT`, else `C:\bun` on Windows                                                                                                               | MCP `bun_docs_*`, training corpora                                                        |

## Governance

- **Maintainers.** The `aphrody-labs` organization maintains this component. Maintainers merge changes into `main`
  and publish releases.
- **Decisions.** Design decisions that affect the distribution are recorded in [`docs/aphrody/`](docs/aphrody).
- **Contributions.** Contributions arrive as pull requests against `main`
  ([CONTRIBUTING.md](CONTRIBUTING.md)). Every change comes with a test. Tests for code that exists only in this
  component go in [`test/js/first_party/`](test/js/first_party).
- **Security reports.** Handled as described in [SECURITY.md](SECURITY.md).
- **Code of conduct.** [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Branches

- **`main`.** The only working branch.
- **`bun`.** Every aphrody-labs repository that ports a project to Bun (tailwindcss, base-ui, next.js, shenron)
  publishes the port on a `bun` branch. Here that branch is an alias of `main`. It never receives direct commits;
  it only moves by fast-forward (`git push origin main:bun`).

## Upstream

Upstream `oven-sh/bun` changes arrive only by merge: `bun scripts/aphrody/sync-upstream.ts [--push]`.

- Package renames to the `@aphrody` scope are resolved during the merge by [`scripts/aphrody/scope.ts`](scripts/aphrody/scope.ts).
- On a conflict, the files this repository owns keep its version: `README.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `CONTRIBUTING.md` and `docs/installation.mdx` (`OWNED` in `sync-upstream.ts`).
- Any other conflict stops the sync.

The workflows under `.github/workflows/aphrody-*.yml` describe the automated version of this process. GitHub Actions
is disabled on this repository, so maintainers run the sync by hand.

## Releases

A release is the `aphrody-v<base>-aphrody.<n>` tag. Its notes are in [RELEASES.md](RELEASES.md). Maintainers
publish a release by hand, in these steps:

1. Build each target with `bun scripts/build.ts --profile=release --lto=off --canary=off --version-tag=aphrody.<n>`.
   Windows builds run on Windows. Linux builds use the `aphrody/build-linux:26.04` (glibc) and
   `aphrody/build-alpine:3.24` (musl) images.
2. Check every binary: `bun --version` must print `<base>-aphrody.<n>`, `bun --revision` must show the release
   commit, and a smoke test must pass.
3. Package each binary under the upstream archive names (`bun-<os>-<arch>[-musl].zip`, each containing
   `bun-<os>-<arch>[-musl]/bun[.exe]`). Write `SHA256SUMS.txt` with LF line endings; the installers check
   archives against it.
4. Publish the release with `gh release create aphrody-v<version> --repo aphrody-labs/bun`, then publish npm with
   `bun scripts/aphrody/publish-runtime.ts publish --version <version> --assets <dir>`.
