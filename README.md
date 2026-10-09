<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/logo-wordmark-dark.svg">
    <img alt="Aphrody" src="docs/logo/logo-wordmark-light.svg" height="80">
  </picture>
</p>

# Aphrody runtime

The JavaScript and TypeScript runtime of [Aphrody](https://aphrody.com).

Aphrody is an operating system shipped as a distribution. This repository, `aphrody-labs/bun`, builds one of its
components: the runtime. Its main output is the `bun` executable, which bundles the runtime, bundler, test runner and
package manager. It also publishes the packages and crates that ship alongside it. The Aphrody product is developed
in the `aphrody-labs/aphrody` repository, which is private, and consumes this component through the release channels
listed under [Install](#install).

|                   |                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Component         | runtime: executables `bun` and `bunx`                                                                |
| Component version | `1.4.4`, stable release tag `bun-v1.4.4` ([Versioning](#versioning))                                 |
| Releases          | [GitHub releases](https://github.com/aphrody-labs/bun/releases); notes in [RELEASES.md](RELEASES.md) |
| Branch            | `main` (the only working branch)                                                                     |
| Upstream          | [Bun](https://github.com/oven-sh/bun) ([Upstream](#upstream))                                        |
| License           | MIT, with LGPL-2 parts (JavaScriptCore, WebKit): [LICENSE.md](LICENSE.md)                            |
| Documentation     | [aphrody.com/docs](https://aphrody.com/docs), built from [`docs/`](docs)                             |
| Security          | [SECURITY.md](SECURITY.md)                                                                           |
| Governance        | [APHRODY.md](APHRODY.md)                                                                             |

## Install

Inside an Aphrody installation, the distribution installs and updates the runtime itself. The installers below are
the same ones it uses.

```sh
# Linux and macOS
curl -fsSL https://aphrody.com/install.sh | bash

# Windows (PowerShell)
irm https://aphrody.com/install.ps1 | iex
```

These are [`scripts/aphrody/install.sh`](scripts/aphrody/install.sh) and
[`install.ps1`](scripts/aphrody/install.ps1). Each one downloads the release archive for the current platform and
checks it against the release's `SHA256SUMS.txt`, then installs `bun` and `bunx` into `$BUN_INSTALL/bin` (default
`~/.bun/bin`). By default they install the latest release. You can pass an upstream base version instead
(`bash -s 1.4.4`, which prefers the stable `bun-v1.4.4` release) or an exact tag
(`bash -s bun-v1.4.4`). Legacy Aphrody tags remain accepted.

- `bun upgrade` installs the latest release of this repository.
- npm: `@aphrody/bun-runtime` installs the binary for the current platform through optional dependencies
  ([`scripts/aphrody/publish-runtime.ts`](scripts/aphrody/publish-runtime.ts)). It is published after the GitHub
  release, so its version can lag behind.
- The targets built for each release are listed in [RELEASES.md](RELEASES.md). The latest release has no macOS
  binary; on macOS, install `aphrody-v1.4.3-aphrody.2` (the last release with macOS builds) or build from source.

Check an installation with `bun --version` (component version) and `bun --revision` (component version and commit).

## Build from source

```sh
# Clones this repository, installs the toolchains (LLVM, Rust; MSVC on Windows) and dependencies, then builds
curl -fsSL https://aphrody.com/bun/setup.sh | bash
irm https://aphrody.com/bun/setup.ps1 | iex
```

These setup scripts are [`scripts/aphrody/install-dev.sh`](scripts/aphrody/install-dev.sh) and
[`install-dev.ps1`](scripts/aphrody/install-dev.ps1); their options are documented in
[docs/project/setup.mdx](docs/project/setup.mdx). Once you have a checkout, you can run the builds directly:

```sh
bun bd                                    # debug build: build/debug/bun-debug
bun bd test <file>                        # run a test with the debug build
bun scripts/build.ts --profile=release --canary=off   # stable release, without a version suffix
```

Requirements and platform notes: [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/project/building-windows.mdx](docs/project/building-windows.mdx).

## What this component adds to Bun

This list covers the main additions, with links to their documentation in `docs/`:

- Windows: [`bun:windows`](docs/runtime/windows.mdx) (Win32 and system APIs), [`bun:winrt`](docs/runtime/winrt.mdx),
  [`bun:winui`](docs/runtime/winui.mdx), [`bun:dotnet`](docs/runtime/dotnet.mdx) (.NET hosting),
  [`bun msvc`](docs/runtime/msvc.mdx) and `bun winmd`, the `@aphrody/bun-windows-*` packages (Win32 API families
  generated from win32metadata) and [`packages/bun-winsvc`](packages/bun-winsvc) (Windows service host).
- Linux and desktop: [`bun:linux`](docs/runtime/linux.mdx) and [`bun:cosmic`](docs/runtime/cosmic.mdx).
- Tooling: [`bun mcp`](docs/runtime/mcp.mdx), [`bun lsp`](docs/runtime/lsp.mdx), [`bun ssh`](docs/runtime/ssh.mdx),
  [`bun host`](docs/runtime/host.mdx), [`bun lint`](docs/runtime/lint.mdx) and [`bun fmt`](docs/runtime/fmt.mdx),
  [`bun n2b`](docs/runtime/n2b.mdx), [`bun agent-plugin`](docs/project/agent-plugin.mdx) and
  [`bun:graph`](docs/runtime/graph.mdx).
- Other languages: [`bun:python`](docs/runtime/python.mdx), `bun python` and `bun uv`, and `bun:wasm`
  ([docs/bundler/wasm.mdx](docs/bundler/wasm.mdx)).
- Packages: [`packages/bun-tools`](packages/bun-tools) (rclone and rsync,
  [docs/project/rclone-rsync.mdx](docs/project/rclone-rsync.mdx)), [`packages/bun-supervisor`](packages/bun-supervisor)
  and [`packages/bun-cosmic`](packages/bun-cosmic). npm packages from upstream Bun are published under the
  `@aphrody` scope; for example, `bun-types` is published as `@aphrody/bun-types`.

Tests for code that exists only in this component live in [`test/js/first_party/`](test/js/first_party).

## Versioning

Native Windows source synchronization defaults to **1.4.4**:
`bun run bun:windows --apply`, then `bun run bun:windows --check`.
See [the targeted version and infrastructure audit](docs/aphrody/windows-version-sync.md)
for planning, checksum-qualified deployment pins and independent package versions.

- **Stable runtime version.** New stable releases use `bun-v1.4.4` and print
  `1.4.4`, without a suffix. Installers, deployment selection and runtime npm
  publication accept this tag. Legacy `aphrody-v*` releases remain readable.
- **Legacy component version.** `bun --version` prints `<base>-aphrody.<n>`. `<base>` is the upstream Bun version the
  component is built from, and `<n>` counts the Aphrody releases of that base. For example, `1.4.3-aphrody.4` is
  the fourth release built on Bun 1.4.3. Release tags are `aphrody-v<component version>`. `Bun.version` and
  `process.versions.bun` keep the upstream base version (`1.4.3`), so packages that check the Bun version see the
  version whose APIs this component provides.
- **Distribution version.** Aphrody distribution releases have their own identifiers, published on
  [downloads.aphrody.com](https://downloads.aphrody.com/latest.json). A distribution release pins the runtime by its
  runtime version and prefers its stable `bun-v<version>` release, with legacy Aphrody tags accepted.

## Upstream

This component is based on [Bun](https://bun.com) ([oven-sh/bun](https://github.com/oven-sh/bun)), developed by Oven
and contributors.

- **Licenses.** Bun's license and attribution are kept as published upstream: [LICENSE.md](LICENSE.md),
  [docs/project/license.mdx](docs/project/license.mdx) and the notices in `vendor/`. Upstream does not build, publish
  or support releases of this component, so report problems with them here.
- **Sync policy.** `oven-sh/bun` `main` is merged into `main` with merge commits, never rebased, by
  [`scripts/aphrody/sync-upstream.ts`](scripts/aphrody/sync-upstream.ts). During the merge,
  [`scripts/aphrody/scope.ts`](scripts/aphrody/scope.ts) applies the `@aphrody` package rename. The files this
  repository owns (`README.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `docs/installation.mdx`) keep
  their local version. GitHub Actions is disabled on this repository, so maintainers run the sync and the releases by
  hand.
- **WebKit.** JavaScriptCore comes from the WebKit build pinned in
  [`scripts/build/deps/webkit.ts`](scripts/build/deps/webkit.ts). Prebuilt archives are downloaded from
  [aphrody-labs/WebKit](https://github.com/aphrody-labs/WebKit), or from
  [oven-sh/WebKit](https://github.com/oven-sh/WebKit) for archives aphrody-labs/WebKit does not publish.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities
privately, as described in [SECURITY.md](SECURITY.md).
