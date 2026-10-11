# GN fork and Bun toolchain integration

The public fork is [aphrody-labs/gn](https://github.com/aphrody-labs/gn).
Its upstream is [gn.googlesource.com/gn](https://gn.googlesource.com/gn).
Bun vendors the complete tracked tree, including the upstream BSD license,
at fork revision `3f99f58c2568dd267952dcd80696406474f7e2ea`.
The upstream base is `0035961837fbcfe875d855744b3eda4fd2eefb43`.

`vendor/gn/.bun-vendor.json` records every source file's Git blob, SHA-256,
size and mode, plus the source archive hash. Validate the copy with
`bun run gn:vendor`. To reproduce it from an existing fork checkout, use
`bun run gn:vendor --source=C:/path/to/gn-fork`. Existing differing files
cause a failure rather than an overwrite.

The fork adds `GN_BUILD_LAST_COMMIT_POSITION` to the bootstrap generator.
It accepts an explicit numeric commit position and hexadecimal revision,
so a vendored tree retains its version without a nested Git repository.
The existing unchanged-header optimization and debug dummy version remain.
The MSVC bootstrap probes `/showIncludes` and records its actual localized
prefix in a UTF-8 Ninja graph. This preserves header dependency tracking
on installations that have only French compiler resources.

## Commands

`bun run gn bootstrap` builds GN and its upstream unit tests in `build/gn`.
It uses an existing Python interpreter through `bun uv`, with downloads disabled.
On Windows, generation and Ninja execute through `bun msvc exec`.
Release mode is the default. Parallelism defaults to four jobs and can be
set with `--jobs`. Source, toolchain and compiler flag fingerprints invalidate
the bootstrap configuration; Ninja reuses unchanged object files.
No engine component is linked into Bun and this command adds no runtime startup work.

`bun run gn verify` runs upstream GN unit tests and prints the GN version.
`bun run gn exec -- --version` invokes the built GN.
`bun run gn plan --project chromium --checkout C:/src/chromium/src`
prints graph generation and compilation commands for an existing synchronized
checkout. Project choices include `chromium`, `v8` and `skia`.
Use `bun run gn build` with the same project and checkout options to execute
the printed generation and compilation steps.
Arguments following `--` pass unchanged to GN, including a single
`--args=...` argument containing spaces. Project dependencies retain their
own pinned versions; the generic fork does not replace a project's GN pin automatically.

## Qualification boundaries

Windows qualification on 2026-10-11: the vendored GN builds natively with
MSVC 14.51.36231, and all 859 upstream GN unit tests pass. Three fork bootstrap
tests and five Bun launcher tests pass, with 28 Bun assertions. Scoped TypeScript,
oxlint, formatting and repository scope checks pass. The executable reports
`2599 (3f99f58c2568)`. A second bootstrap reports `ninja: no work to do`.
Ninja records three source-header dependencies for `version.obj`; before the
localized prefix correction, this object had zero recorded dependencies.
These results qualify GN and its launcher, not Chromium, V8, Skia or ChromiumOS.

Host preflight: the VPS has Clang 21, Ninja and Python 3.12, with 52 GiB free
on its root filesystem. DBFR has Ninja and 25 GiB free. GN was absent from
both hosts' PATH at preflight. The Linux qualification plan uses an isolated
VPS checkout and four jobs; it does not replace production binaries or services.

GN generates build graphs. It does not supply the C++ compiler, operating
system SDK, project dependencies or ChromiumOS board toolchain.
[Chromium's Windows instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
require clang-cl, Visual Studio 2026 and Windows SDK 10.0.28000.2270.
The current workstation exposes MSVC 14.51 and SDK 10.0.26100.0;
`bun msvc which clang-cl` reports that clang-cl is missing.
Use each project's hermetic compiler rather than replacing it with cl.exe.

ChromiumOS requires its Linux SDK and board workflow. The Windows helper
rejects a ChromiumOS compilation plan; GN vendoring does not make MSVC
a ChromiumOS compiler. Full Chromium, V8, Skia and ChromiumOS engine builds
remain separate qualification gates.
