# Vendored dependencies

One file per dependency. Each file exports a `Dependency` object that tells
the build system where to fetch the source, how to build it, and what
libraries/headers it provides.

## Adding a dependency

1. Copy `libdeflate.ts` (the simplest direct dep) to `<name>.ts`
2. Fill in `name`, `repo`, `commit`, `sources`, `includes`, `provides.includes`
3. Add `import { <name> } from "./<name>.ts"` + entry in `allDeps` array in `index.ts`
4. Add the name to `DepName` in `../source.ts`
5. `bun run scripts/build/phase3-test.ts` to verify it builds

That's it. For most deps you're done. A dep with several libraries, its own
generators or helper executables adds `groups` and `steps` to the same
`direct` spec — see `webkit.ts`. The fork's curl (`curlNative`) is still built
by its own cmake, `kind: "nested-cmake"`: see `NestedCmakeBuild` in `../source.ts`.

**`name` must match the directory on disk** (`vendor/<name>/`). If your repo
is `oven-sh/WebKit`, name it `"WebKit"` — that's what `git clone` creates.
Case-sensitive filesystems enforce this.

**Ordering in `allDeps` matters:**

- Put deps with `fetchDeps: ["X"]` AFTER X in the list
- Link order: deps that PROVIDE symbols go after deps that USE them

## Removing a dependency

1. Delete `<name>.ts`
2. Remove from `allDeps` in `index.ts`, and from `DepName` in `../source.ts`
3. If any other dep has `fetchDeps: ["<name>"]`, remove that reference

## Updating a commit

Change the `commit` field. That's it. The build system computes a source
identity hash from `sha256(commit + patch_contents)` — changing the commit
invalidates `.ref`, triggers re-fetch, and everything downstream rebuilds.

The `.github/workflows/update-<name>.yml` jobs do this automatically by
sed'ing the `const <NAME>_COMMIT = "..."` line. If you rename that
constant, update the workflow too.

**For `direct` deps:** the source list is hardcoded, so a bump that adds
or removes a `.c`/`.cpp` upstream needs a matching list edit here. CI
catches a missed addition (link error on the unresolved symbol); a
removed file fails at compile. Either way the auto-bump PR goes red,
which is the cue to diff the upstream `CMakeLists.txt`.

## Iterating on a dep from a local checkout

To hack on a vendored dep (e.g. chase a bug in the mimalloc or libuv fork)
without cutting a commit and bumping the pin each round, point the build at
a git clone:

```sh
git clone https://github.com/oven-sh/mimalloc ~/code/mimalloc
bun bd --local-deps=mimalloc=~/code/mimalloc test foo.test.ts
```

Any `github-archive` dep the graph compiles or includes can be redirected
(so not lolhtml or rust-argon2, which cargo reads from `vendor/` via the workspace
`Cargo.toml` — point that path at your checkout instead); several at once
with `name=path,name=path`. Cross-dep references (`depSourceDir()`, e.g.
lsquic's `-I` into boringssl) follow the redirect. The checkout is compiled
as-is — no fetch, no `.ref` stamp, and the dep's `patches` are **not**
applied (they target the pinned tarball), so start the clone from the pinned
commit if you want an identical baseline. Switching a dep between pinned and
local moves its `-I` path, so the first build after the switch recompiles
every TU that sees the dep's headers; after that, edits are picked up
incrementally through the compiler depfiles. The
build banner shows `local:<name>` while this is on. Don't edit
`vendor/<name>/` in place instead — it is wiped whenever the pin or patches
change.

WebKit is prebuilt unless redirected: `--webkit=local` (the `-local`
profiles, `bun run build:local`) is `--local-deps=WebKit=$BUN_WEBKIT_PATH`,
or `vendor/WebKit` when that is unset, and `--local-deps=WebKit=<path>` on any
profile means the same for one build.

## Common fields

```ts
export const mydep: Dependency = {
  name: "mydep",

  // Source tarball. Fetched from GitHub's archive endpoint (no git history,
  // just the files at `commit`). Most deps use this.
  //
  // Other kinds: `prebuilt` (download pre-compiled .a, e.g. WebKit default),
  // `local` (user-managed checkout: what a github-archive dep becomes via
  // `--local-deps`, see above), `in-tree` (source in src/).
  source: () => ({ kind: "github-archive", repo: "owner/repo", commit: "..." }),

  // Optional: macro name for bun_dependency_versions.h (process.versions).
  // Omit if this dep shouldn't appear there.
  versionMacro: "MYDEP",

  // Optional: .patch files applied after extraction, or overlay files
  // copied into source root (e.g. inject a CMakeLists.txt).
  patches: ["patches/mydep/fix-something.patch"],

  // Optional: deps whose SOURCE must be ready before this one builds
  // (for -I cross-dep headers). See libarchive for an example.
  fetchDeps: ["zlib"],

  // How to build. `direct` lists sources explicitly; emitDirect compiles
  // each as a first-class cc/cxx edge and the resulting .o's go straight
  // into bun's link line. See `DirectBuild` in ../source.ts for all
  // optional fields (lang/pic/defines/headers/codegen/groups/steps/forbidUndefined).
  build: cfg => ({
    kind: "direct",
    sources: ["src/foo.c", "src/bar.c"],
    includes: [".", "include"],
    // defines: { MYDEP_STATIC: 1 },
    // cflags: ["-std=c11"],
    // headers: { "config.h": "..." },   // Hand-written config.h.
  }),

  // What this dep exposes to bun's own compile. `libs` is ignored for
  // direct builds (the .o's are already on the link line); `includes`
  // are relative to the SOURCE dir.
  provides: cfg => ({
    libs: [],
    includes: ["include"],
    // defines: ["MY_DEP_STATIC=1"],  // Preprocessor defines for bun's compile.
  }),

  // Optional: skip this dep on some platforms.
  enabled: cfg => !cfg.windows,
};
```

## Build types

- **`direct`**: Sources compiled as first-class `cc` edges in our ninja
  graph — no sub-process, no cmake configure, one job pool for everything, and
  LTO sees across the dep boundary into bun's call sites. See `DirectBuild` in
  `../source.ts`.
- **`cargo`**: Rust deps (currently lolhtml and rust-argon2). See `CargoBuild` in `../source.ts`.
- **`none`**: Header-only or prebuilt. No build step; `.ref` stamp is the output.

## Worked examples

- **brotli.ts** — simplest direct dep
- **mimalloc.ts** — direct build, single unity TU compiled as C++
- **tinycc.ts** — direct build with a build-time codegen tool
- **zlib.ts** — headers only (`in-tree`, `build: none`): zlib-rs is a Rust crate of the workspace
- **libarchive.ts** / **cares.ts** — direct build with hand-written per-target config.h
- **boringssl.ts** — direct build with NASM assembly (win-x64) and a large gen/ manifest; `forbidUndefined` (with libuv.ts) keeps a dep that bun points at mimalloc from calling libc's allocator behind its back
- **sqlite.ts** — direct build, in-tree source (lives in `src/`, not `vendor/`)
- **libuv.ts** — `enabled: cfg => cfg.windows` for a platform-only dep
- **lolhtml.ts** — cargo build with rustflags
- **webkit.ts** — `prebuilt`, and for a local checkout a direct build with
  source `groups` (bmalloc, WTF, JavaScriptCore), generator and executable
  `steps`, a per-group PCH, and file lists read from the checkout's own CMake
  files at configure (`../cmake.ts`)

## How a dep builds

1. **fetch** → `vendor/<name>/.ref` stamp (`restat = 1`)
   - Downloads tarball, extracts, applies patches
   - `.ref` contains `sha256(commit + patches)[:16]`
   - restat: if identity unchanged, no write, downstream pruned
2. **configure** → `buildDir/deps/<name>/CMakeCache.txt`
   - `cmake --fresh -B <dir> -D...`
   - `--fresh` drops the cache so stale -D values don't persist
   - restat: inner cmake might not touch cache
3. **build** → `.a` files
   - `cmake --build <dir> --target ...`
   - restat: inner ninja no-ops if nothing changed

`restat` is what makes incremental builds fast — if step N was a no-op,
ninja prunes everything after it.

## Qualified native SDKs

`scripts/build/native-sdk-index.json` owns immutable normalized assets: a ZIP
(`format: "zip"`) or an npm registry tarball (`format: "npm"`, members under
`package/` beside its `package.json`). Its `assets` list is empty until the
first registry pack is published; no downloaded SDK or vendor replacement is yet
qualified by that list. A supported direct C/C++ dependency prefers a matching
asset in `BUN_NATIVE_SDK_MODE=auto` (the default). `source` explicitly uses the
existing source build; `sdk` requires an indexed SDK. Automatic selection uses
only an exact source/patch, compiler, target and build-option match; otherwise
it continues through the source owner. Explicit SDK mode rejects mismatches.
Local dependencies, Rust dependencies and unsupported build kinds retain their
source owners.

The factory and consumer share `computeNativeSDKABI` and
`nativeSDKSourceIdentity`. Normalized dependency flags and specifications,
compiler/linker identity files, sanitizer/LTO/CPU settings and toolchain headers
participate in compatibility. The download checks its pinned byte count and
SHA-256 while streaming. Every build verifies the installed receipt and member
hashes; undeclared files and symbolic links are rejected. Cached SDKs live below
the configured cache directory, with source-relative headers in `source/` and
generated headers in `generated/`. Cross-dependency includes therefore retain
paths such as BoringSSL's `include/` without reading a second vendor tree.

Only a linked, tested factory receipt may enter the index. Source vendors remain
until the published asset, consumer build and target runtime are qualified.

### From the npm registry

`scripts/aphrody/native-sdk-registry.ts` turns the dependencies a build
compiled into npm packages, one per dependency and target:
`@aphrody/bun-native-sdk-<dep>-<os>-<arch>[-musl]`, version
`0.0.0-c<commit 12>.a<archive sha256 16>`, with npm `os`/`cpu`/`libc`.

```sh
bun factory run -- bun bd --profile=release      # on the VPS: link and test bun
bun scripts/aphrody/native-sdk-registry.ts pack --build build/release [--deps zlib,zstd]
bun scripts/aphrody/native-sdk-registry.ts publish --out build/release/native-sdk-registry [--dry-run]
bun scripts/aphrody/native-sdk-registry.ts record --out build/release/native-sdk-registry
bun scripts/aphrody/native-sdk-registry.ts status --build build/release
```

`pack` requires every dependency up to date in that build and the linked bun to
pass `native-sdk-smoke.ts` (zlib, zstd, brotli, BoringSSL,
libarchive and SQLite roundtrips); it skips a dependency the build already
downloaded. `publish` skips a version already on the registry. `record` adds an
asset to the index only once the registry serves its exact bytes. Builds then
download the tarball and check its size and SHA-256 pins; `BUN_NATIVE_SDK_REGISTRY`
points npm assets at an https mirror (or a localhost one) under the same pins.
Each pack matches only builds with its exact ABI: the same compiler identity,
flags, LTO, sanitizer and system headers, so a factory pack serves the builds of
that factory image.
