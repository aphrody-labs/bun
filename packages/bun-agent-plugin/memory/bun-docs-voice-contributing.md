---
name: bun-docs-voice-contributing
description: "Bun docs Voice rules, docs/types review expectations, contributor build setup (Linux/macOS/Windows), debug tooling, profiling, license and security policy"
metadata:
 type: reference
---

# Docs voice + contributing process (docs/project/*, CONTRIBUTING.md, SECURITY.md, REVIEW.md.claude/docs/landing-prs.md)

## Docs Voice rules (docs/project/contributing.mdx "Voice", adapted from Next.js guide)
Goal: a developer new to Bun reads the page once and can act.
1. Short sentences, one point each. Several commas / parenthetical / dash aside -> split or make a list.
2. Plain words: "use" not "utilize", "to" not "in order to". Cut filler ("Note that", "Please").
3. Active voice, actor named: "Bun reads `bunfig.toml`", never "`bunfig.toml` is read".
4. Present tense for current behavior: "Bun installs", not "will install".
5. Name the subject when "this"/"it" is ambiguous.
6. Reader = "you"; Bun/tool = the other actor. No "we", no "let's".
7. Never "easy", "simple", "just", "quick" - state the concrete property ("one command", "no configuration").
8. Say what to do, not what to avoid ("use `port: 0` so the OS picks a free port"). Limitations are stated as plain facts.
9. Gender-neutral ("developers", "they").
10. Link text names its destination ("see [`bun install`](/pm/cli/install)"), never "here".
11. Run every code example; check option names/defaults against `main`.
docs/README.md summarizes: short sentences, active voice, present tense, second person, no easy/simple/just.
Docs-wide passes enforcing this: PRs #28788, #33112; #38686 rewrote pages that reintroduced violations.

## Docs/types/comments review rules (landing-prs.md)
- Same PR must sweep everything describing old state: comments beyond hunk, mirrors, JSDoc, READMEs, CLAUDE.md, --help, error hints. Stale comment = correctness bug.
- Comments load-bearing and true; why-comments for special cases, magic constants (cite spec), workarounds (link issue). SAFETY comments state invariant + enforcement.
- Verify every doc claim by execution; fetch every URL; preview rendering (unbalanced fence swallows rest). No marketing; never claim full compat when partial.
 An unverifiable AI-drafted page was deleted wholesale (+9/-325). Untouched existing docs are out of scope.
- `.d.ts` mirror runtime exactly in the same PR; declare only implemented API; literal unions (`'A' | 'B' | (string & {})` for open sets); overloads;
 `prop?: T | undefined` (exactOptionalPropertyTypes); `Uint8Array<ArrayBuffer>`; defaults for new type params; no new globals colliding with lib.dom/@types/node;
 no `as any`; no `*/` inside JSDoc (glob patterns break parse). Validate in @aphrody/bun-types fixtures with AND without DOM (`bun-packages`).
- JSDoc for zero-context reader: semantics, edge behavior, sentinels (0 = unlimited), equivalent CLI flag. .d.ts JSDoc is the canonical IDE surface.
REVIEW.md sections (repo root): Tests reviewers reject; Native memory safety (most-blocked); Correctness (bug class); Error handling; Code style & idioms; Architecture & layering; Security.
landing-prs.md sections: Node/Web compat; API design; Performance; Cross-platform; Dependencies & vendoring; Docs/types/comments; PR process.

## Dev environment (contributing.mdx; CONTRIBUTING.md is the same minus docs-voice section, plus `nix develop .#pure` / `CMAKE_SYSTEM_PROCESSOR` lines)
- ~10 GB disk, 10-30 min. Nix alternative: `nix develop` then `bun bd`.
- Packages: macOS `brew install automake ccache cmake coreutils gnu-sed go icu4c libiconv libtool ninja pkg-config rustup-init ruby`; apt/pacman/dnf/zypper lists in doc.
- Rust: nightly pinned in `rust-toolchain.toml`, install via rustup (not distro cargo). Needs a release Bun installed (build uses bundler + codegen).
- LLVM **23.1.1** enforced (mismatch -> memory allocation failures at runtime): `brew install llvm@23`, `llvm.sh 23 all`; check `which clang-23`.
- Ubuntu <= 20.04: `'span' file not found` -> install gcc-11/g++-11 + update-alternatives. macOS libarchive error -> `brew install pkg-config`; `-lSystem` -> `xcode-select --install`.
 No static libatomic -> `bun run build --static-libatomic=off`.
- ccache auto-detected.

## Build/run
- `bun run build` -> `build/debug/bun-debug` (`x.y.z_debug`). `bun bd <args>` builds then runs, printing build output only on failure.
- Faster loops: batch changes; `cargo check -p <crate>` / `bun run rust:check`; `bun run watch` (cargo check on save); rust-analyzer; CodeLLDB.
 `src/js/**` changes rebuild almost instantly; only final link unavoidable.
- Debug logs: `BUN_DEBUG_<scope>=1` (for `declare_scope!`/`scoped_log!`), `BUN_DEBUG_QUIET_LOGS=1`, `BUN_DEBUG=<file>.log`. Transpiled sources at `/tmp/bun-debug-src/<abs path>`.
- Codegen: `generate-jssink.ts` (JSSink.cpp/h for streams sinks), `generate-classes.ts` (`*.classes.ts` -> Rust+C++), `cppbind.ts` (exported C++ fns -> `cpp.rs`)
 `bundle-modules.ts` (`src/js/{node,bun,thirdparty}` builtins), `bundle-functions.ts` (WebKit-style builtins like ReadableStream).
- Bindgen (project/bindgen.mdx, maintainers): `*.bind.ts` next to Rust file declares fn/class schema; supports strings, function variants, `t.dictionary`, enums
 `t.oneOf`, attributes (integer ranges), callbacks, classes. Will replace `.classes.ts` and JS2Native eventually.
- Release: `bun run build:release` -> `build/release/bun` + `bun-profile`. ASAN on by default in debug on Linux/macOS (~2x slower);
 `bun run build:debug:noasan` or `--asan=off`; `bun run build:asan` for release+ASAN.
- PR builds: `bunx bun-pr <pr|branch|url> [--asan]` -> `bun-<pr>` on PATH (needs gh).
- CI (BuildKite, `.bk.yaml`, `BUILDKITE_API_TOKEN`): `bun run ci:status|ci:errors|ci:logs|ci:watch|ci:find [#PR|url|branch|build]`.
- Local WebKit: `git clone http<github.com>/oven-sh/WebKit vendor/WebKit`, `bun sync-webkit-source` (pins `WEBKIT_VERSION` in `scripts/build/deps/webkit.ts`)
 `bun run build:local` -> `build/debug-local` (update `src/js/builtins.d.ts` first line, `.clangd` CompilationDatabase, `.vscode/launch.json`). 8 GB+.

## Windows (building-windows.mdx)
- PowerShell 7; `Set-ExecutionPolicy -Scope CurrentUser Unrestricted`; Bun >= 1.1; Visual Studio "Desktop Development with C++" (+Git).
- Always source `.\scripts\vs-shell.ps1` (check `Get-Command mt`). Don't put ninja/cmake on global PATH.
- Output `build\debug\bun-debug.exe`; WebKit cache `$Env:BUN_INSTALL\build-cache\webkit-<ver>-debug`, relocate with `BUN_BUILD_CACHE_DIR`.
- Tests: `bun run test <path>` (each file in separate bun-debug) or `bun-debug test <path>`.
- Gotchas: use `rc.exe` not `llvm-rc.exe`; "permission denied writing bun-debug.exe" = running instance.
- Cross-compile from Linux: xwin splat at `/opt/winsysroot` (or `WINDOWS_SYSROOT`/`--winsysroot`), `bun run build --profile=windows-x64[-release]|windows-arm64[-release]`
 (= `--os=windows --arch=aarch64`).

## Benchmarking/profiling (benchmarking.mdx)
- Timing: `performance.now`, `Bun.nanoseconds`. Tools: mitata (micro), bombardier/oha (HTTP), hyperfine (CLI).
- `heapStats` from `bun:jsc`; `Bun.generateHeapSnapshot` -> view in Safari/WebKit GTK devtools; native heap `Bun.unsafe.mimallocDump`.
- `--cpu-prof` (.cpuprofile for Chrome/VS Code), `--cpu-prof-md` (markdown, LLM-friendly), `--heap-prof` (V8-format, `Heap.<date>.<time>.<pid>.<tid>.<seq>.heapprofile`), `--heap-prof-md`.

## License (license.mdx)
Bun MIT. Statically links JavaScriptCore/WebKit (LGPL-2) -> relink via oven-sh/WebKit + `bun run build:local`. Linked libs: boringssl, brotli, libarchive, lol-html, ls-hpack
ls-qpack, lsquic, mimalloc, picohttp, zstd, simdutf, tinycc (LGPL 2.1), uSockets, zlib-ng, c-ares, ICU 78, libbase64, libuv (Windows), libdeflate, libjpeg-turbo, libspng
libwebp, highway, HdrHistogram_c, sqlite (Linux+Windows), uWebSockets fork, Tigerbeetle IO code. Embedded browser polyfills (acorn, buffer, *-browserify, events, process, url, util...).
Credits: transpiler + resolver ported from esbuild; CSS parser from Lightning CSS/Servo; name by @kipply.

## Security / roadmap
