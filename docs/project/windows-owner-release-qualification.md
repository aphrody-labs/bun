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
