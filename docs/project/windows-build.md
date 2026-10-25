# Windows developer build

How the Windows debug build of this fork runs on the owner's workstation: the one command,
what it finds on its own, where its caches live, how to clean them and how long it takes.
Prerequisites and cross-compiling are in [building-windows.mdx](building-windows.mdx).

Measured on 2026-10-25: Intel i7-13700F (24 threads), 32 GB RAM, one NVMe disk (`C:`),
Windows 11, LLVM 23.1.3 in `C:\Program Files\LLVM`, Visual Studio Build Tools 2022
(MSVC 14.44, Windows SDK 10.0.26100), rustup nightly `nightly-2026-09-15`, all six add-on
plugins mounted under `plugins/`.

## The command

```sh
bun bd                  # build build/debug/bun-debug.exe
bun bd test <file>      # build, then run a test with it
```

It works the same from a new PowerShell, cmd or Git Bash, with no developer prompt and no
`vcvars`:

- `scripts/build.ts` loads the MSVC environment itself (`loadNativeMsvcEnv`): `bun msvc sync`
  resolves the toolset the prebuilt WebKit needs (14.44, from `pins.windowsSysroot.crt`) through
  the Setup Configuration API and caches PATH, INCLUDE and LIB in
  `%LOCALAPPDATA%\bun\msvc\x64-toolset-14.44-sdk-10.0.26100.0\env.json`. The newest Visual
  Studio instance is not used: on this machine that is VS 2026 Insiders, whose toolset lacks
  the x64 libraries.
- Every tool in `build.ninja` is an absolute path: `clang-cl`, `lld-link`, `llvm-lib`, `llvm-rc`
  from `C:\Program Files\LLVM\bin`, the pinned ninja from the build cache, rustc from the
  pinned toolchain. Git Bash's `/usr/bin/link.exe` and the order of PATH play no part.
- `cargo check`, `cargo build` and rust-analyzer work from any shell too. Configure writes the
  git-ignored `.cargo/config.toml` with a native Windows entry: lld-link by absolute path,
  `/LIBPATH:` for the 14.44 toolset's libraries, and an `[env]` table that gives cc-rs
  (build scripts) `clang-cl`, `llvm-lib` and that toolset's INCLUDE and LIB. A developer
  prompt's own values win (`force = false`). Without it, rustc and cc-rs pick VS 2026 and
  fail with `LNK1104: cannot open 'msvcrt.lib'` or a `cl.exe` error. Run `bun bd` once after a
  fresh clone so the file and the codegen files that the build scripts read both exist.
- Every edge names the bun that runs it. `bun run` puts a `bun-node-<revision>` copy first on its
  scripts' PATH, which `bun bd` from a new PowerShell picked up and Git Bash did not, so each
  switch of shell used to rebuild all 1041 crates. `bunExecPath()` in `scripts/build/tools.ts`
  maps the copy back to the installed bun.

Switching shells still costs one relink (about 2.5 min): Git Bash sets `LANG` and PowerShell
does not, and uutils' `uucore` build script embeds the locales `LANG` names, so its crates and
the binary differ between the two. Set `LANG` the same in both (a user environment variable) to
avoid it.

`bun bd` waits if another build holds `build\debug\.build.lock` (several agents share the
directory). It needs `PROTOC_INCLUDE` to point at an existing directory when the `vpn` plugin
is mounted (`prost-build` panics otherwise). On this machine the variable is
`C:\bun\vendor\chromium\src\third_party\protobuf\src`.

## Caches

| What                                                                              | Where                                                                           | Shared by                                                   |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Build cache (prebuilt WebKit, dependency tarballs, pinned ninja, Node.js headers) | `%USERPROFILE%\.bun\build-cache` (`BUN_BUILD_CACHE_DIR`)                        | every build directory and checkout                          |
| MSVC environment                                                                  | `%LOCALAPPDATA%\bun\msvc\<key>\env.json`                                        | every build                                                 |
| Rust toolchain                                                                    | `%USERPROFILE%\.rustup\toolchains\nightly-2026-09-15-*`                         | every checkout pinned to it                                 |
| Crates and git dependencies                                                       | `%USERPROFILE%\.cargo\registry`, `%USERPROFILE%\.cargo\git`                     | every Cargo project                                         |
| sccache                                                                           | `%USERPROFILE%\.cache\sccache` (`SCCACHE_DIR`, 30 GB, `SCCACHE_IDLE_TIMEOUT=0`) | cc-rs in build scripts, plugin builds, other Cargo projects |
| Debug build                                                                       | `C:\bun\build\debug` (about 60 GB after a clean build)                          | one build at a time                                         |

Each prebuilt WebKit is about 2.5 GB, one directory per pinned commit and flavour
(`webkit-<commit16>-debug`, `-lto`). A pin that no checkout uses any more can go; the Bun OS
checkout (`C:\src\bun-os\toolchains\bun`) still pins `87ee10da`.

### What is and is not compiler-cached

- **Rust crates of `bun`'s graph: not cached.** Each crate is a ninja edge that runs rustc
  directly (`scripts/build/rust/run.ts`). The edge releases a crate's `.rmeta` to its dependents
  as soon as rustc reports it written, which is what keeps the crate chain pipelined; sccache
  only replies when the compile ends, and it does not cache incremental compiles, which every
  workspace crate is in a debug build. The build prints `RUSTC_WRAPPER (...) is not used` once to
  say so.
- **C sources of build scripts: cached.** cc-rs reads `RUSTC_WRAPPER`, so the C that `ring`,
  `zstd-sys` and others compile goes through sccache.
- **Plugins: cached.** Each mounted plugin is a plain `cargo build` in
  `build\debug\plugin-target`, and it uses the machine's wrapper, so a new build directory takes
  the plugins' dependency crates from sccache.
- **Bun's C and C++: not cached.** ccache 4.14 refuses every compile of this graph
  (`unsupported_compiler_option`) because the flags carry `/clang:-fno-omit-frame-pointer`,
  `/clang:-mno-omit-leaf-frame-pointer` and `/clang:-ferror-limit=100`, and sccache refuses
  the `@<obj>.rsp` response files the Windows compile edges use. Making either work means
  respelling those flags in `scripts/build/flags.ts` (or teaching ccache `/clang:`); until then
  ccache stays uninstalled, since it would only add a process per compile.

### Linking

`bun-debug.exe` (about 450 MB) is linked by lld-link through `clang-cl -fuse-ld=lld`, with
`/DEBUG:FULL /PDBPAGESIZE:8192` and the `/OPT:NOREF /OPT:NOICF` that `/DEBUG` implies; the
PDB is about 2.9 GB. Alone, the link takes about 32 s, three quarters of it writing the PDB.
lld-link already merges types with global hashes, so `/DEBUG:GHASH` saved 2 s of 32 and was
not adopted; `/DEBUG:FASTLINK` and `/INCREMENTAL` are MSVC link.exe features lld-link
ignores. The duplicate-definition scan of the link inputs (`verify-binary.ts duplicates`) runs
after the link instead of beside it, its llvm-objdump and llvm-nm chunks in parallel: next to
the link, each took about 2 min 20 s; one after the other, about 30 s each.

### Parallelism

ninja runs `cores + 2` jobs; C and C++ compiles are capped at the core count (the `compile`
pool) so a rustc edge never waits behind them; each local rustc runs its front end on 8 threads
(`-Zthreads=8`); nested dependency and plugin builds share the `dep` pool of 4. With 32 GB,
a clean build left about 15 GB free at its peak.

## Timings

| Build                                                             | Before            | After       |
| ----------------------------------------------------------------- | ----------------- | ----------- |
| Clean `bun bd` (empty `build\debug`)                              | 41 min 14 s       | 21 min 18 s |
| No-op `bun bd`                                                    | 26 s              | 23 s        |
| One Rust file (`src/runtime/cli/plugin_command.rs`)               | 2 min 21 s        | 1 min 50 s  |
| One C++ file (`src/jsc/bindings/Cookie.cpp`)                      | 2 min 39 s        | 1 min 40 s  |
| Relink only (`bun-debug.exe` deleted)                             | 1 min 8 s         | 1 min 0 s   |
| `cargo check -p bun_runtime --lib`, Git Bash, no developer prompt | fails (`LNK1104`) | 2 min 20 s  |

Configure went from 7.9 s to 4.7 s of each of those: it no longer runs
`rustup toolchain install` when the pinned toolchain and its `rust-src` are already there. Of
the remaining no-op time, about 15 s are the six plugins' `cargo build`s, which run on every
build (cargo decides what is stale) and wait for each other on the shared target directory's
lock. Unmount plugins you are not working on to skip them.

The two clean builds are not a controlled comparison. The second had sccache serving 601 of
2030 compiles (the C of build scripts and the plugins' crates), which took the plugins from 78
to 43 CPU minutes, and the scan no longer slowed the link (14 min 9 s beside it, 1 min 46 s
after it); but the Rust crates also took 127 CPU minutes instead of 333 for the same work, which
is load on the machine during the first build, not a change. Count on 20 to 25 minutes.

In the first clean build the six plugins take 78 CPU minutes and, sharing one target directory, run
one at a time: the last four minutes of the build are only plugins. The Rust crates take 333 CPU
minutes, bun's C and C++ 195, the build scripts 17.

## Cleaning

```sh
bun run clean               # build/debug (the default preset)
bun run clean rust          # rust-target/ of every profile
bun run clean cpp           # obj/ and pch/ of every profile
bun run clean cache --dry-run  # the shared build cache; affects every checkout
```

`build\debug` only grows: every change of a crate's flags or dependencies leaves the previous
`.rlib`, `.rmeta` and incremental directory of that crate behind, and plugin moves leave their
old target directory. It reached 140 GB before the clean build of 2026-10-25 and is about
60 GB fresh. Delete it when it gets large, with no build running
(`Get-CimInstance Win32_Process` for ninja, cargo, rustc or clang under `C:\bun`). Outside the
checkout:

- `rustup toolchain list`: keep the toolchains a `rust-toolchain.toml` pins (`C:\bun`,
  `C:\src\*`); `rustup component remove rust-docs` is safe on every toolchain.
- `%USERPROFILE%\.cargo\git\db`: a repository no `Cargo.lock` under `C:\bun` or `C:\src`
  references can go; cargo fetches it again if one does.
- `uv cache prune`; sccache trims itself to `SCCACHE_CACHE_SIZE`.
