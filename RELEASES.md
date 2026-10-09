# Releases

Release notes of the Aphrody runtime component (`aphrody-labs/bun`). Each release is the GitHub release of the tag
`aphrody-v<base>-aphrody.<n>`, where `<base>` is the upstream Bun version it is built on
([Versioning](README.md#versioning)). Every release ships a `SHA256SUMS.txt` that the installers check.

## 1.4.3-aphrody.4

- Tag: `aphrody-v1.4.3-aphrody.4`. Base: Bun 1.4.3, upstream `main` merged up to `e655c580329` (2026-10-08).
- Build: release profile, LTO off, built by hand (GitHub Actions is disabled on this repository).
- Targets:
  - `bun-linux-x64.zip`: glibc, built in `aphrody/build-linux:26.04` (Ubuntu 26.04, glibc 2.43);
  - `bun-linux-x64-musl.zip`: musl, built in `aphrody/build-alpine:3.24` (Alpine 3.24);
  - `bun-windows-x64.zip`: built on Windows 11 with MSVC;
  - `aphrody-bun-windows-service.zip`: `bun.exe`, the `bun-winsvc.exe` service host
    ([`packages/bun-winsvc`](packages/bun-winsvc)), `service.ts` and `install.ps1`.
- No macOS or ARM64 binary; `aphrody-v1.4.3-aphrody.2` is the last release with them.
- Changes since 1.4.3-aphrody.3:
  - new commands: `bun mcp` (MCP server over stdio and streamable HTTP), `bun host`, `bun lsp`, `bun ssh`, and
    `bun agent-plugin` built into the executable;
  - built-in `zlib-sync` and `erlpack` modules (synchronous inflate with a persistent window, Erlang External Term
    Format);
  - `zlib-sync`: `result` keeps the output of `Z_NO_FLUSH` pushes until the next `Z_SYNC_FLUSH` or `Z_FINISH`, so
    messages split across several frames decode;
  - `bun:cosmic` config: `XDG_DATA_HOME` and `XDG_DATA_DIRS` set the system defaults on Windows too;
  - installers: `latest` resolves to the newest `aphrody-v*` release, not GitHub's latest release of the
    repository (which can be a tools release).

## 1.4.3-aphrody.3

- Tag: `aphrody-v1.4.3-aphrody.3`, commit `d46f0ed6c69`. Base: Bun 1.4.3.
- Build: release profile, LTO off, built by hand.
- Targets: `bun-linux-x64.zip` (glibc, built on the build host), `bun-windows-x64.zip`,
  `aphrody-bun-windows-service.zip`. `SHA256SUMS.txt` lists the two `bun-*` archives only.

## 1.4.3-aphrody.2

- Tag: `aphrody-v1.4.3-aphrody.2`, commit `f7a7086b602`. Base: Bun 1.4.3.
- Build: cross-compiled on Linux arm64 against pinned sysroots, like upstream releases (linux-gnu: glibc 2.31; musl:
  Alpine), release profile, LTO on.
- Targets: macOS (aarch64, x64, x64-baseline), Linux (aarch64, x64, x64-baseline; glibc and musl), Windows (x64,
  x64-baseline, aarch64), each with a `-profile` build.
- First release where `bun --version` prints `1.4.3-aphrody.2` while `Bun.version` stays `1.4.3`.

## 1.4.3-aphrody.1

- Tag: `aphrody-v1.4.3-aphrody.1`, commit `37edd09a678`. Base: Bun 1.4.3.
- Build: release profile, LTO off.
- Targets: `darwin-aarch64`, `linux-aarch64`, `linux-x64`, `windows-x64`, each with a `-profile` build.
