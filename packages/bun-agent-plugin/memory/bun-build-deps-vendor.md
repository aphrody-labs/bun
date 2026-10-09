---
name: bun-build-deps-vendor
description: "Vendored native deps (scripts/build/deps/*.ts, vendor/), allDeps order, BuildSpec kinds, WebKit prebuilt/local, version pins (LLVM, nightly, node), --local-deps, bump workflows"
metadata:
 type: reference
---

# Vendored dependencies

One file per dep in `scripts/build/deps/<name>.ts` exporting a `Dependency` (`source.ts` type: `{name, source, patches?, fetchDeps?, build, provides, enabled?, versionMacro?}`; source/build/provides are functions of `Config`). Docs: `scripts/build/deps/README.md`. Build flow: `bun-build-system-internals`.

## allDeps order (`deps/index.ts`) = fetch order + static link order
picohttpparser, nodejsHeaders, zlib, zstd, brotli, libdeflate, libarchive, libjpegTurbo, libspng, libwebp, cares, hdrhistogram, highway, libuv, lolhtml, rustArgon2, lshpack, lsqpack, mimalloc, sqlite, tinycc, boringssl, lsquic, webkit (LAST).
Rules: a dep with `fetchDeps: ["X"]` must come after X (zlib before libarchive/libspng; boringssl before lsquic). Providers after users on the link line.

## Source kinds
`github-archive` (tarball at commit, no git history; most deps), `prebuilt` (download .a/.lib: WebKit default, nodejs-headers), `local` (user checkout: WebKit local mode), `in-tree` (source in src/, e.g. sqlite).

## BuildSpec kinds
- `direct` (default for C/C++): sources listed explicitly; each is a cc/cxx edge in bun's graph, `.o` straight into the link (LTO sees across). Fields in `DirectBuild` (source.ts): sources, includes, defines, cflags, lang, pic, headers (hand-written config.h), codegen, forbidUndefined.
- `nested-cmake`: `cmake --fresh -B` + `cmake --build` as edges (`NestedCmakeBuild`), used by WebKit local.
- `cargo`: rule kept, unused — lolhtml and rust-argon2 are path deps in the Cargo workspace (`vendor/lolhtml`, `vendor/rust-argon2`).
- `none` / `prebuilt`: no build step.
Each dep → fetch (`vendor/<name>/.ref` = `sha256(commit+patches)[:16]`, restat) → configure (cmake only) → build; pool `dep` depth 4. Phony targets `<name>`, `clone-<name>`, `configure-<name>`.

Worked examples: hdrhistogram/libdeflate (simplest direct), mimalloc (single unity TU as C++), tinycc (build-time codegen tool), zlib (per-source SIMD flags + `.h.in`), libarchive/cares (hand-written per-target config.h), boringssl (NASM on win-x64, big gen manifest, `forbidUndefined` with libuv), sqlite (in-tree), libuv (`enabled: cfg => cfg.windows`), lolhtml (cargo), webkit (nested-cmake + prebuilt).
Patches live in `patches/<dep>/`.

## Add / remove / bump
- Add: copy hdrhistogram.ts, fill name/repo/commit/sources/includes/provides, import + add to `allDeps` in index.ts, add to `DepName` in `../source.ts`. `name` must equal `vendor/<name>/` dir (case-sensitive; WebKit is `"WebKit"`). (README's `phase3-test.ts` step is stale: file doesn't exist — verify with `bun run build --target=<name>`.)
- Bump: change `const <NAME>_COMMIT` / `commit`; `.ref` identity changes → refetch + rebuild downstream. `.github/workflows/update-<name>.yml` (cares, hdrhistogram, highway, libarchive, libdeflate, lolhtml, lshpack, sqlite3, zstd, vendor) sed that line. Direct deps: upstream file additions/removals need a source-list edit (CI link error is the cue).
- Never edit `vendor/<name>/` in place — wiped when pin/patches change.

## Iterate on a dep locally
`bun bd --local-deps=mimalloc=~/code/mimalloc[,name=path] test foo.test.ts` — any github-archive dep except lolhtml/rust-argon2 (point Cargo.toml path instead). No fetch, no patches applied; banner shows `local:<name>`. First build after switching recompiles TUs seeing its headers.

## WebKit (JavaScriptCore) — `deps/webkit.ts`
- `WEBKIT_VERSION = "0c06faadf65bf8e8c8ad3a5a8aca83e1e9ed653f"` (oven-sh/WebKit commit; override `--webkit-version=`). Must not be an `autobuild-preview-pr-*` tag on main.
- Prebuilt (default, `webkit: "prebuilt"`): release asset `bun-webkit-<os>-<arch>[-musl]<suffix>`, suffix from `prebuiltSuffix`: `-debug` if Debug, else `-lto` if LTO; then `-asan` if ASAN. Each is a distinct ABI. Extracted to `<cacheDir>/webkit-<ver16><os/arch keys><suffix>` (e.g. `~/.bun/build-cache/webkit-0c06faadf65bf8e8-debug` on this machine). ICU bundled on linux/windows (sicudt/icuin/icuuc on Windows), system ICU on macOS.
- Local (`--webkit=local`, profiles `debug-local`/`release-local`, `bun run jsc:build[:debug|:lto]`): clone oven-sh/WebKit into `vendor/WebKit/` yourself; nested cmake; USE_MIMALLOC=ON + USE_EXTERNAL_MIMALLOC unless asan; `ENABLE_SANITIZERS=address` for asan; release local = RelWithDebInfo unless LTO; MSVC runtime MultiThreaded[Debug]. Skills: `upgrade-webkit`, `sync-webkit-source` script.
- No `windows-arm64-lto` prebuilt → LTO off for Windows arm64.

## Version pins (`scripts/build/ci-images/spec.ts` `pins`)
`bun_dependency_versions.h` (`depVersionsHeader.ts`) from each dep's `versionMacro` → `process.versions`.

## Other vendor libs
boringssl (TLS/crypto; skill `upgrade-boringssl`), brotli, cares, hdrhistogram, highway (SIMD; used by `bun_core::strings`), libarchive, libdeflate, libuv (Windows event loop only), lolhtml (HTMLRewriter), lshpack (HPACK), lsqpack+lsquic (HTTP/3), mimalloc (allocator), nodejs headers, picohttpparser, rust-argon2 (`Bun.password`), tinycc (bun:ffi cc; off on android/freebsd), zlib (zlib-ng), zstd, sqlite (in-tree amalgamation; `scripts/update-sqlite-amalgamation.sh`), libjpeg-turbo/libspng/libwebp (Bun.Image codecs).
