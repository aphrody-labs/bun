# Local Chromium toolchain

Use the existing `C:/bun` checkout on `main`. GN lives in `vendor/gn`,
depot_tools in `vendor/depot_tools`, and Chromium in `vendor/chromium/src`.
These upstream sources are permanent dependencies, not additional Bun worktrees.
Chromium dependencies and build outputs remain outside the Bun Git index.

```powershell
bun gn exec -- --version
bun depots_tools setup
bun depots_tools exec -- gclient help
bun chromium setup --jobs 8
bun chromium doctor
bun chromium build --jobs 4
```

`depot_tools` is an alias for `depots_tools`. The launchers are checkout package
scripts; they do not add runtime modules or change the installed Bun executable.
`plan` prints commands without applying them. Setup clones missing depot_tools
from its official upstream with shallow history, bootstraps upstream Windows
tools and creates an unmanaged Chromium solution, then runs
`gclient sync --no-history --jobs 4 --revision src@<SHA>`. Existing configurations
resume synchronization. Setup and sync default to the exact source revision
`e20c553087353010f4b71143841c189447ac1628`; use `--revision <40-hex-SHA>` to change
it deliberately. The explicit revision avoids gclient's initial discovery of all
Gerrit references, which took several minutes during the first fetch here.
It does not create a Git mirror or duplicate Chromium history. A process lock in
`build/chromium/setup.lock` rejects concurrent mutations; it is removed on normal
completion and never automatically removes another owner's lock.

Child processes receive depot_tools first in PATH, local Visual Studio selection,
`DEPOT_TOOLS_WIN_TOOLCHAIN=0`, `DEPOT_TOOLS_UPDATE=0`, and Windows-compatible Git
path/line-ending settings. Existing host environment and Git configuration remain
unchanged. depot_tools updates are explicit Git operations in its existing folder.
Builds use Chromium's pinned GN, clang-cl and local Siso/autoninja, with the full
`chrome` target. Siso uses `--quiet --heartbeat_period 30s` to retain command
errors and periodic progress without printing every build step. Its full logs
remain in `out/bun/siso_output`, `siso_metrics.json` and `siso_trace.json`.
The default component build has debug symbols disabled to reduce disk use;
upstream WebGPU settings are preserved.

## Windows prerequisites and qualification

The [current upstream Windows instructions](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
require Visual Studio 2026, SDK 10.0.28000.2270 or newer, ATL/MFC and debugger
10.0.26100.3323 or newer. ChromiumOS requires a Linux board SDK and is not a Windows
MSVC target. See the [depot_tools guide](https://chromium.googlesource.com/chromium/tools/depot_tools/+/main/README.md)
for the upstream bootstrap and dependency manager.

On 2026-10-11 this PC had VS Build Tools 18.10.2, SDK 10.0.26100.0 and debugger
10.0.26100.7705. The existing VS catalog offers SDK 10.0.28000.2526. Installing the
missing components through the native owner CLI requires an elevated terminal:

```powershell
sudo.exe --inline --chdir C:\bun bun msvc setup --add Microsoft.VisualStudio.Component.VC.ATLMFC --add Microsoft.VisualStudio.Component.Windows11SDK.28000
```

The non-elevated installation attempt returned installer code 5007. The owner-
authorized `sudo.exe` retry completed with exit code zero. `bun msvc info` now
reports complete SDK `10.0.28000.0`, and the targeted setup dry-run reports
`nothing to do` for both SDK and ATL/MFC.
GN is compiled and qualified separately (see [GN](gn.md)).
depot_tools at `a03dfbf7f2d1cefa2795d81d59ca4f16c8616a8f` bootstrapped successfully
and `gclient help` ran through the Bun launcher. Chromium's primary source at
`e20c553087353010f4b71143841c189447ac1628` was fetched and extracted. The initial
dependency synchronization failed with `SyntaxError: invalid syntax` while
`gclient_eval.EvaluateCondition` parsed an empty DEPS variable. The cause was
missing Windows architecture variables in this session: Python reported an empty
machine architecture, causing `host_cpu` evaluation to fail. The launcher now
restores `PROCESSOR_ARCHITECTURE` only in the child environment, preserving existing
values and using the native Bun architecture as fallback. Real DEPS parsing passes
without upstream changes. Dependency synchronization and every hook subsequently
completed successfully. Chromium's pinned GN generated 36,511 targets from 5,086
files. The full `chrome` target subsequently completed on this PC; the artifact
qualification below records the actual browser and GPU evidence.

The launcher passed fourteen tests and 103 assertions through `bun bd -j4 test
test/internal/chromium.test.ts`, including a real local Windows batch fixture.
Type checking, oxlint, formatting and scope checks passed. Two existing native
build blockers were corrected: a duplicate `graph_native` declaration and stale
Cargo entries after OXC moved to vendored workspace packages. The corrected
lockfile retains package versions and passes the exact locked build unit graph.

## Local performance settings

This PC has an i7-13700F (16 cores, 24 threads), about 32 GiB RAM and a healthy
Micron 2400 NVMe. Its high-performance power plan and AC sleep settings already
satisfy long builds. The pagefile previously peaked near 29 GiB, so maximal CPU
parallelism alone is not a useful default. Use eight jobs for dependency downloads
and four for Chromium compilation initially; six were selected here after
measuring about 15 GiB of free physical memory. Measure before increasing jobs.
`bun bd -j4` bounds the Bun build factory without changing its configuration.
Preserve existing build outputs and the shared 50 GiB sccache; cleaning these
caches forces unnecessary recompilation.

The local Bun and Chromium repositories passed
`git update-index --test-untracked-cache`. Their local Git settings now enable
`core.fsmonitor`, `core.untrackedCache`, `core.preloadindex` and `core.fscache`.
Both fsmonitor daemons report that they are watching their own repository.
These settings do not apply globally. To remove the newly enabled monitors and
untracked caches, run the following in each repository:

```powershell
git fsmonitor--daemon stop
git config --local --unset core.fsmonitor
git config --local --unset core.untrackedCache
```

For build measurements, set `NINJA_SUMMARIZE_BUILD=1` in the current terminal
before `bun chromium build --jobs 4`. Source pins and bounded jobs avoid repeated
work and excessive memory pressure; no download-rate improvement is claimed
without comparable transfer measurements.

During dependency synchronization, the physical Ethernet interface received
654,501,746 bytes in 54.294 seconds (about 12.05 MB/s). This measures the entire
interface, not an isolated Chromium transfer or a before/after speed increase.
The first browser build reached 1,074 completed steps before encountering missing
declarations in Chromium's filtered `undici-types` dependency. Preserve the build
outputs when repairing dependencies so completed work can be reused.
The preflight now restores only missing declarations from the exact
`undici-types` version in Chromium's lockfile, checking its official tarball URL,
SHA512 integrity and declaration paths before writing. Existing metadata and
different local declarations are preserved. On this PC it restored 43 declarations
for version 7.18.2; generation passed and the full browser build resumed.

Chromium's Siso build currently keeps its upstream compiler command. Adding a
`cc_wrapper` for sccache changes Siso's Windows command matching and disables
precompiled headers; no full-build benefit has been qualified here. The existing
Bun cache remains available. Siso's throughput-oriented batch mode is retained;
`--fast_local` has no measured benefit for this full browser build.

## Git and GitHub configuration

The local `main` branch now tracks `origin/main` at `aphrody-labs/bun`, correcting
its previous `bun-os/main` tracking. Local pushes default to `origin` with
`push.default=simple`; pulls require fast-forward history. Fetch prunes stale
remote refs and permits eight independent fetch workers. Local commit identity
is `aphrody-dev <contact@aphrody.com>`. GitHub CLI's active `aphrody-dev` account
has administrator access to this repository; existing Windows credential
management is retained.

There are currently no Git submodules or gitlinks in Bun. Recursive submodule
fetch/update is disabled locally; explicit submodule operations permit eight
fetch workers. Do not create a `.gitmodules` entry without an actual pinned
gitlink. GN is vendored as tracked source with its provenance receipt; Chromium
uses its own pinned DEPS and gclient solution. This preserves the one-folder
layout and avoids duplicate dependency management.

The shared ignore file excludes local coordination, build outputs, depot_tools
bootstrap state and ignored vendor downloads. It does not untrack the existing
vendored GN source. GitHub authentication secrets remain in the credential store.

## Persistent Windows command paths

The local PC's machine and user PATH values were updated through `bun:windows`
registry calls under `sudo.exe`, preserving their original registry types
(`REG_EXPAND_SZ` and `REG_SZ`). Windows system directories take precedence.
Duplicate entries, including the user's repeated System32 entry, were removed.
The selected SDK 28000, Visual Studio CMake and Ninja directories are available
system-wide; MSVC's include and library environment remains scoped to
`bun msvc exec`. Existing unrelated tools and paths are retained.

The user PATH includes `C:\bun\build\cli`, the qualified fork GN directory,
Chromium's `out\bun`, Aphrody's installed binaries, Bun and Cargo. Local command
wrappers route `chromium`, `depot_tools`, `depots_tools` and `gclient` through Bun
with the correct checkout. Mutating depot_tools commands retain the setup lock;
wait for the active browser build before running them. Chromium compilation
continues to select its pinned tools in its child environment.

The original PATH values, types, plan and readback receipt are saved locally in
`C:\bun\build\windows-path`. The receipt records successful notification through
Win32 `WM_SETTINGCHANGE` and `SendMessageTimeoutW`; see
[Microsoft's notification contract](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-settingchange).
New terminals receive the persistent configuration. Existing processes keep
their inherited environment; reload PATH from the machine and user environment
values when checking from an already open shell.

Qualification resolved all configured command paths and ran GN 2599, Ninja
1.13.2 and CMake 4.3.1-msvc1. `bun msvc doctor` and `sync --check` passed. A C
program including `windows.h` compiled with `/W4 /WX` through `bun msvc exec` and
executed successfully. The installed runtime remains
`1.4.3-aphrody.4+41211b568`; source builds are qualified separately. Chromium's
doctor confirms sources, depot_tools and clang. The browser artifact completed
and passed the dedicated qualification below.

## Compiled browser qualification

On 2026-10-11 at 19:19 local time, the original retained-object Chromium build
completed with exit code zero. Its initial six-worker phase and subsequent
eight- and twelve-worker phases reused the same `out/bun` sources and outputs.
Intentional pauses serialized large Bun links with Chromium compilation; no
build cache was cleaned. The final command was `bun chromium build --jobs 12`.
Siso reported no failed commands, and the setup lock was removed on completion.

The actual output is `C:/bun/vendor/chromium/src/out/bun/chrome.exe`, accompanied
by the component `chrome.dll` and generated runtime dependencies. The executable
SHA-256 is
`8e40f755b04cbaf123920466322131e9276219cf2440480bfd491457616ab147`.
CDP reports `Chrome/157.0.8099.0`, protocol `1.3` and V8 `15.7.108`. Its CDP
revision field is all zeroes, so source provenance uses the explicit checkout
pin above rather than that field.

`bun bd -j2 -n scripts/aphrody/chromium-qualify.ts` executed the existing qualified
debug runtime `1.4.4-debug+4b7c53fb290409f026e628e09b5d2b80cdb76d32`. In this
factory, `-n` lists pending native steps and then executes the existing binary;
those listed steps were not compiled. This qualifies the new browser through
that runtime and does not qualify newer pending Bun source inputs.

The qualifier uses a new synthetic profile beneath
`build/chromium/qualification-profile` and waits for the navigation's exact CDP
loader. It does not access the copied user profile or the original Chrome
profile. The local page passed fetch/readback of value `42`, canvas 2D,
arithmetic, Wasm validation and secure-context checks. WebGPU reported an
available NVIDIA Lovelace adapter with `fallback: false`; a real WGSL compute
dispatch and buffer readback returned exactly `[10, 11, 12, 13]`.

The ignored receipt `build/chromium/qualification.json` records the executable
hash, browser version, runtime revision and GPU results. This is a separate
Chromium process controlled through native `bun:chromium` CDP. It does not prove
embedded Bun, V8/JSC engine parity, performance gains or an installed System32
launcher. Installation is qualified separately by the installer owner.

After the installer copied the payload, the same qualifier passed again with
`--installed`. That mode selects only
`C:/Program Files/BunChromium/Application/chrome.exe` and writes the separate
`build/chromium/installed-qualification.json` receipt. The installed executable
hash matched the compiled artifact; browser version, local web probes, NVIDIA
non-fallback WebGPU and the exact WGSL readback all passed. This direct installed
browser test is separate from the installer's System32 launcher and profile
checks.
