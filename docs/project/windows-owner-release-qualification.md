# Clean Windows release qualification — 2026-10-10

The clean detached checkout builds the published source
`54619ce189c4280e729544b21a95503dc814fa0d` with the native MSVC 14.44 owner
factory and the default release profile. No source or release optimization
flag changed. The factory invocation reports Bun.version `1.4.4`, the exact
source revision, and its built bun-profile.exe path. The CLI banner retains
the source's `1.4.4-canary.1` channel; this is a candidate, not a new stable tag.

The Windows bun.exe is 152247296 bytes. SHA256:
`08f2b2a880d8dc7d4a72b4923d4adb3a0387b46dd266ad180eac4d5a3ec8e391`.
The checkout remains clean after build and qualification.

## Native tests

Nine release runtime suites pass 102 tests, with 27 platform skips and zero
failures. Coverage includes filesystem watchers, terminal subprocesses,
timer races and parallel worker startup/reporting.

The complete selected gate, including all test/internal files, passes
995 tests, with 60 skips, zero failures, six snapshots and 146629 assertions
across 101 files. Release requires `--expose-internals` for internal test APIs,
as specified by ModuleLoader.rs. The initial invocation omitted that flag:
960 tests passed and five files failed to load bun:internal-for-testing.
The final invocation reruns every selected file with the supported flag;
no source, assertion or deadline was changed.

## GPU and Python

The same clean release executes the existing Buv GPU qualification against
the canonical aphrody_ffi provider. Physical RTX 4070 selects Dx12; WGSL and
CUDA independently return all 37 exact expected values. Driver enumeration
reports NVIDIA 616.92, CUDA 13.4, compute capability 8.9 and 46 multiprocessors.
The provider SHA256 remains
`351e930b6b7fe81f4eca8f405c59e0123e9430e320fb51a5d9782ef6ab7bd6ee`.

The published PyCUDA test passes one test and six assertions through the
shared Buv/PyJS Python host. It uses the existing isolated Python environment,
provider and CUDA toolkit. This proves native Windows execution; it does not
prove zero-copy buffers, a shared CUDA context, Linux GPU activation or musl ABI.

## Plugin

The release's agent-plugin doctor recognizes the installed Codex and Claude
plugin `1.4.4+2fb86b44ed79` without a Bun-version mismatch. Plan-before-apply
installation with `--update --json` returns `up to date`, both targets and
zero actions. Installed content remains the 313-file plugin tree previously
verified against the embedded payload. Skills are used in this workflow;
actual provider activation or newly exposed MCP tools is not inferred.

## Build resources and remaining gates

The first build stopped on a libc build-script rustc probe routed through
an inherited sccache wrapper, with socket timeout 10060. The successful retry
clears RUSTC_WRAPPER and CARGO_BUILD_RUSTC_WRAPPER only in its process. The
native factory already invokes rustc directly; global cache settings remain.

Before the build, an exact-file plan reclaimed 9557 old Rust metadata files
from the resolved physical canonical debug/deps directory. Every file was
older than one day, matched the hashed .rmeta name, had Rust magic, and retained
its planned size/time. A canonical Cargo mutex and idle compiler check guarded
application. No recursive removal was used. Executables, DLLs, PDBs, rlibs,
release outputs, source, protected stores and global sccache were preserved.
Measured free space rose from 2753650688 to 15665561600 bytes.

Receipts are local under tmp/windows-clean-release-\*. The artifact qualification
is Windows x64 only. Full release publication, other architectures, packages,
performance equivalence, Linux hardware and production activation remain open.
The separate strict Windows runtime gate retains 53 diagnostics outside the
last owned batches; GNU x64/ARM64 strict gates pass. This document does not
close those plans or change the production runtime.

## Next adapter and host readiness follow-up

The clean release scope check exits zero. An exact list of the five files in
`test/integration/next-bun` passes 82 tests and 319 assertions, zero failures.
The initial directory prefix also matched next-bun-app and next-bun-pages;
that pass was explicitly stopped because its dependency installation was
not yet confined to a local registry. Its partial passes are not counted as
completion of the application integration gate. Actual Next application and
Pages Router gates remain open pending a controlled fixture install.

Fresh native Infra observations confirm DBFR still selects 1.4.3-aphrody.3;
the isolated stripped Linux candidate retains its recorded SHA256. VPS retains
the owner Linux checkout at 4e3ddd04da1, with only the already published Linux
test projection changes, whose exact file checksum matches origin/main.

The catalogued VPS reclaim was planned before application, with no active
Ninja or rustc process. Infra reports exit zero. Measured filesystem available
space rose from 3450236928 to 6331330560 bytes. Its reported 9.87 GiB logical
reclaim includes tmpfs and is not the actual disk gain. Existing Docker
containers, production runtime and DBFR services were not activated or changed.
The next Linux release build still needs its own source/capacity/factory plan.

## Offline real Next applications

BUN_TEST_NEXT_CACHE_DIR selects a preseeded fixture cache. The helper uses
`--offline --frozen-lockfile --cache-dir <cache> --config=<temporary-config>`;
the temporary install config prevents the fixtures' cache=false setting from
disabling the prepared cache. Missing cached packages fail without fetching.
No global Bun configuration, fixture assertion or test deadline changes.
Without the variable, the existing fixture behavior is retained.

Provisioning runs explicitly outside the tests: copy each fixture's package.json
and bun.lock into an isolated preparation directory, then run the owner release
factory with `install --cwd <preparation-dir> --cache-dir <cache>
--frozen-lockfile --ignore-scripts`. Prepare the App fixture 16.1.6 and Pages
overlays 16.4.0 and 16.5.0-canary.4. Set BUN_TEST_NEXT_CACHE_DIR to that cache
for the application gate. This is preparation, not an internet-dependent test.

The release engine at 54619ce189c, with the owned helper patch, passes all
12 tests and 251 assertions across the exact Pages and App fixture files,
zero failures. Pages HTML/API parity passes all three Next versions.
App Router passes Turbopack, webpack, next-bun without Node on PATH, and
Bun.build through @aphrody/next-bun. Coverage includes server actions,
prerendered HTML, RSC payloads, PostCSS execution and client chunk traversal.
This replaces the earlier interrupted application-gate evidence.

The helper's scoped TypeScript dependency closure, Prettier and oxlint gates
all exit zero. The initial offline invocation failed before builds because a
separate --config value became a dependency positional; the supported equals
form fixes the invocation. No runtime workaround or assertion reduction was
introduced. Receipts: tmp/next-owner-offline-plan.json,
next-owner-seed-\*.log and windows-clean-next-offline-apps-final.log/.exit.

## Strict historical performance comparison

The current Windows release was measured against the retained base executable
620b50f6abea3413a30235c5885bfe8cbffd592d (1.4.3). The candidate is 54619ce189c
(1.4.4). Forty measured runs and five warmups use the existing thresholds,
hyperfine and --strict. No threshold or runtime feature was removed.
All startup, build/install, RSS, import and local HTTP blocking thresholds pass.
Startup RSS increases by 816 KiB and builtins RSS by 728 KiB, inside the existing
1 MiB / 2 MiB limits. The strict gate exits one on binary size alone: 152247296
versus 96548352 bytes, ratio 1.577 and delta 55698944 bytes.

PE section inspection attributes 44121356 additional bytes to .text and
10573708 to .rdata. This is executable code/data, not a removable debug section.
The compared source versions differ: these measurements do not isolate the
fork delta at an identical upstream source pin. A current comparable baseline
and the size investigation remain required; no complete performance closure
or release approval is inferred. Receipts: tmp/perf-owner-latest-plan.json,
tmp/perf/owner-54619ce-release/perf-report.json and tmp/perf-owner-pe-sections.log.

## Latest Linux release refresh

The VPS owner checkout advances cleanly to published 988d73b430a after checking
that its sole Linux test modification matches the target blob byte for byte.
Other worktrees and DBFR candidates remain untouched. The existing release
uses 4179013632 measured bytes. With manifests, toolchain, build scripts and
vendor sources unchanged, an incremental plan budgets an entire replacement
release directory plus 2 GB scratch. Available space at the initial observation
is 6456922112 bytes; the runner checks the 6179013632-byte minimum before applying.

The tmux owner-linux-latest runner acquires the canonical heavy factory lock
nonblocking, uses four jobs and nice 10, then invokes the unchanged owner release
factory and its private populated cache. Its subsequent gate includes all
internal tests with --expose-internals and the six established Linux suites.
The runner, Ninja PID, clean source pin and building phase were observed live.
This is an active build, not a successful artifact or deployment receipt.
Plan: tmp/vps-owner-latest-release-plan.json. Remote phase/PID/exit receipts are
in the existing owner-linux-qualification directory; original receipts remain.
