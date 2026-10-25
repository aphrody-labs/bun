---
name: bun-build-windows
description: "Building Bun natively on this Windows machine (<bun>) — prerequisites, MSVC env via `bun msvc sync` (ex vs-shell.ps1), tool discovery, local state (build/debug/bun-debug.exe, caches), Windows-specific gotchas, cross-compiling Windows from Linux"
metadata:
  type: reference
---

# Building Bun on Windows

General commands: `bun-build-commands`. Internals: `bun-build-system-internals`.

## Prerequisites (`docs/project/building-windows.mdx`)

- PowerShell 7 `pwsh` (required: build.ts spawns `pwsh`; error hint "Is PowerShell 7+ (pwsh) installed?"). `Set-ExecutionPolicy -Scope CurrentUser Unrestricted`.
- Bun ≥ 1.1 (runs codegen). Visual Studio 2022 (or Build Tools) with "Desktop Development with C++".
- Local WebKit build (optional, x64): `scoop install make cygwin python`.
- Don't put ninja/cmake on global PATH (risk of building without the VS env). (This machine does have WinGet ninja/cmake on PATH; the build uses its pinned oven-sh/ninja anyway.)

## How the build gets the MSVC environment

- Since 57752e1611c `scripts/build.ts` `loadNativeMsvcEnv` loads the VS dev env natively via `bun msvc sync` (Setup Configuration COM + installer records, no vswhere/.bat/PowerShell), cached in `%LOCALAPPDATA%/bun/msvc/<key>/env.json` until an instance/toolset/SDK changes, pinned to the toolset of `pins.windowsSysroot.crt` (prebuilt WebKit STL ABI, `checkNativeMsvcToolset` in scripts/build/winsysroot.ts); a bun without `bun msvc` runs the `bun-msvc` binary of vendor/find-msvc-tools through cargo.
- Before that (still the reference for CI and manual shells): build.ts re-exec'd through `pwsh -NoProfile -NoLogo -File scripts/vs-shell.ps1 <argv0> scripts/build.ts <args…>` when `VSINSTALLDIR` was unset. `scripts/vs-shell.ps1`: detects ARM64 (`VsArch` arm64/amd64); `vswhere.exe -prerelease -latest -products * -property installationPath` (`-products *` added in fork commit f8119cf0405 so Build-Tools-only installs are found); fallback search `<Program> Files[ (x86)]\Microsoft Visual Studio\2022\*`; dot-sources `Common7\Tools\Launch-VsDevShell.ps1 -Arch <arch> -HostArch amd64|x86` (restores `PROCESSOR_ARCHITECTURE=ARM64` on ARM64); refuses x86 target; then runs args as a command (`& $command $commandArgs; exit $LASTEXITCODE`), redacting long args in the echo.
- Manual: `.\scripts\vs-shell.ps1` in a pwsh terminal, verify with `Get-Command mt`. CI Windows test steps use `pwsh -NoProfile -File .\scripts\vs-shell.ps1 node .\scripts\runner.node.ts …`.
- `bun bd …` works from a new PowerShell, cmd or Git Bash with no developer prompt: `loadNativeMsvcEnv` loads the env in-process and every tool in build.ninja is an absolute path, so Git Bash `/usr/bin/link` (coreutils) never shadows anything. `findMsvcLinker` (tools.ts) probes `<Program> Files/Microsoft Visual Studio/2022/<edition>/VC/Tools/MSVC/<ver>/bin/Hostx64/x64/link.exe` for the rustc edges' host artifacts.
- Plain `cargo check`/`cargo build`/rust-analyzer without a developer prompt: configure writes a native-Windows entry into the git-ignored `.cargo/config.toml` (`msvcHostEntry` in cargo-config.ts): `linker` = lld-link by absolute path, `-Clink-arg=/LIBPATH:` for each dir of the pinned toolset's LIB, and `[env]` (`force = false`) with `CC_/CXX_/AR_x86_64_pc_windows_msvc` (clang-cl, llvm-lib), INCLUDE and LIB. Without it rustc and cc-rs take the newest VS instance (VS 2026 Insiders here, no x64 libs): `LNK1104: msvcrt.lib` or a `cl.exe` failure. Needs one `bun bd` first (the file, and build/debug/codegen that build.rs files read).
- `bun run` puts `<tmp>/bun-node-<rev>` (bun/node links) first on the scripts' PATH; from a fresh PowerShell `bun scripts/build.ts` resolved there, from Git Bash it did not, and that path is in every edge's command (full rebuild on each switch). `bunExecPath()` (tools.ts) maps it back to the same executable elsewhere on PATH.
- LLVM lookup on Windows: `<Program> Files\LLVM\bin` preferred over VS-bundled clang; override with `BUN_TOOLCHAIN_LLVM=<dir with bin/>`, `BUN_TOOLCHAIN_RUST`, `BUN_TOOLCHAIN_CARGO`.
- Native Windows `INCLUDE`/`LIB` come from the dev shell; CPATH-style vars are only scrubbed for cross-Windows builds.

## Windows-specific build behaviour

- Debug default: ASAN OFF on Windows (asanDefault only linux / darwin-arm64) → build dir `build/debug`, exe `build\debug\bun-debug.exe` + `bun-debug.pdb`.
- Compiler: clang-cl; linker lld-link; resources: `<buildDir>/windows-app-info.rc` → `.res` via ninja `rule rc` = `<Program> Files\LLVM\bin\llvm-rc.exe` (tools.ts resolves `llvm-rc` required + `llvm-mt` optional for msvc targets and passes them to nested cmake). The docs' troubleshooting advice "use rc.exe, not llvm-rc" is stale vs the current build.ninja.
- libuv dep only on Windows (`enabled: cfg => cfg.windows`); BoringSSL NASM sources on win-x64.
- Rust: target `x86_64-pc-windows-msvc`; second rust graph `rust-target/shim/` builds `bun-shim-impl.exe` (the `.bin/` launcher, `src/install/windows-shim`, no_std, `-Zbuild-std=core,compiler_builtins`) into `<codegenDir>/bun-shim-impl.exe`, embedded by bun_install. Windows-x64 JSC host functions use `extern "sysv64"` (`bun_jsc::jsc_host_abi!`).
- WebKit prebuilt: `bun-webkit-windows-amd64[-debug|-lto]` extracted to `$BUN_INSTALL\build-cache\webkit-<ver16>-debug` (`webkit-<ver16>-arm64-debug` on ARM64). No LTO on arm64.
- shell.ts `quote` handles cmd.exe partially (no `%VAR%`, `^`, `&|>`); codegen rule on Windows host = `cmd /c "cd /d $cwd && set TARGET_PLATFORM=win32&& … <runtime> $args"`.
- "failed to write output 'bun-debug.exe': permission denied" → a bun-debug.exe is still running (debugger/test).
- `bun run watch-windows` = cargo watch check for x86_64-pc-windows-msvc.

## Caches, timings, cleaning: `docs/project/windows-build.md`

- Rust edges: no RUSTC_WRAPPER (run.ts runs rustc and releases `.rmeta` early; sccache replies only at exit and skips incremental units). cc-rs in build scripts and the plugin `cargo build`s do use the machine's sccache (`~/.cache/sccache`, 30G, `SCCACHE_IDLE_TIMEOUT=0`).
- C/C++: no compiler cache works today: ccache 4.14 rejects `/clang:-f…` options (all 1171 compiles `unsupported_compiler_option`), sccache rejects `@rsp` response files.
- Link: lld-link ~32 s alone, PDB ~2.9 GB (75% of link time is PDB emission); `/DEBUG:GHASH` saves ~2 s; FASTLINK/INCREMENTAL are no-ops in lld-link. The duplicate-definition scan runs after the link (order-only on the exe), chunks in parallel.
- 2026-10-25 timings (i7-13700F, 24 threads, 32 GB): clean 21-41 min (plugins serialize on the shared plugin-target lock and make the last ~3-4 min), no-op ~23 s (configure ~4.5 s + six plugin cargo checks ~15 s), one Rust file ~1 min 50 s, one C++ file ~1 min 40 s.
- `PROTOC_INCLUDE` must point at an existing dir when the vpn plugin is mounted (`C:unendorchromiumsrc	hird_partyprotobufsrc`).

## State of this machine (observed 2026-10-08)

- `<bun>\build\debug\` configured (`configure.json` = `{"profile":"debug","overrides":{}}`) with `bun-debug.exe`, `.pdb`, `smoke-test-passed`, `binary-verified`, codegen (81 files), `rust-target/{host,shim,units,x86_64-pc-windows-msvc,plan.json}`, `toolchain-identity/`. `<bun>\build\types\` has the 4 .d.ts.
- Tools: clang/clang-cl 23.1.3 at `<Program> Files\LLVM\bin`, cargo/rustup in `~\.cargo\bin`, ninja + cmake from WinGet Links, pwsh from WindowsApps, perl = Git-Bash `/usr/bin/perl` on Bash PATH; NASM 3.02 is found by the build (`toolchain-identity/nasm.txt`) though not on Git Bash PATH (nasm is optional in tools.ts, asserted at use: BoringSSL win-x64 + libjpeg-turbo SIMD; hint `winget install NASM.NASM`); go, ruby, ccache not on Bash PATH (ccache optional).
- Shared cache `~\.bun\build-cache\` (2026-10-25): `ninja/bun-ninja-5ecd8831/`, `nodejs-headers-26.3.0/`, `tarballs/`, `webkit-d6375c72affe0f70-debug/` (this checkout), `webkit-87ee10da087b63e0-{debug,lto}/` (pinned by `C:\src\bun-os\toolchains\bun`).

## Cross-compiling Windows from Linux (how CI does it)
