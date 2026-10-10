# Bun, UV and Python integration

## GPU and Linux 7.2 migration

- [x] Install and enable the Bun fork plugin in Codex and Claude.
- [x] Publish the RTX 4070 driver, CUDA, Alpine and WSL source audit.
- [x] Correct the D3D12 descriptor-handle ABI and prove native clear/copy on RTX 4070.
- [x] Pass the D3D12 JavaScript gate with the rebuilt Bun executable.
- [x] Qualify the existing wgpu probe with exact compute readback on hardware.
- [x] Expose the shared GPU SDK through Buv and pass the six provenance/export gates.
- [x] Qualify Buv GpuRuntime WGSL/D3D12 and CUDA through canonical aphrody_ffi with CUDA 13.4/NVRTC 13.4.59: exact 37-value readbacks and the combined PyCUDA/Buv/PyJS gate pass; the complete Python suite passes 43 tests.
- [x] Qualify PyCUDA computation through the shared Buv/PyJS CPython host.
- [x] Port the Aphrody Rust kernel patches onto pinned upstream Linux 7.2.9 (`dc79e99b05799`).
- [x] Build the new kernel, pass driver Clippy and boot seven accelerator selftests in QEMU.
- [x] Pass bun_core strict Clippy, six target checks and 43 changed-binary Python tests (`ce143eadb8f`).
- [x] Pass strict GPU/registry pointer checks on Windows x64/ARM64 and seven changed-binary hardware/registry tests (`6ebd6ed3140`).
- [x] Fix host collector ARM64/macOS cfg coverage; pass bun_host strict Clippy on all six Windows/Linux/macOS targets, 15 native host tests, 137 rebuilt-Bun tests (4 skips) and real Windows host collection. The rebuilt link still has zero duplicate strong symbols.
- [x] Balance toast WinRT initialization with RAII, preserving caller MTA/STA apartments; regressions fail on the installed runtime and all five changed-binary WinRT tests pass. Consolidate Windows handle registries with Bun collections/guarded locks; 31 Windows/WinRT tests pass, including actual NTFS and D3D12. Seven owned files have no strict diagnostics on Windows x64/ARM64; whole-runtime Clippy retains 184 diagnostics elsewhere.
- [x] Qualify DNS pointer/task ownership and unaligned sockaddr reads without another native-query allocation: 43 local changed-binary DNS tests pass (16 platform skips); the DNS file has no strict diagnostics on Windows/Linux GNU x64/ARM64.
- [ ] Finish compiler strict Rust gates: 43 native Python tests and six provenance tests pass; bun_runtime still reports 148 Windows and 9 Linux GNU diagnostics outside the owned compiler and native safety paths. The sccache command-length opt-out remains process-local.
- [ ] Finish strict validation and delivery for the Node pointer/pool batch. The six-target snapshot passes with the isolated Darwin rootfs patch (`tmp/rootfs-darwin-makedev-owned.patch`); that shared source was restored after discovering the SP wildcard reservation. Integrate the patch after resolving ownership, then rerun current-source gates. bun_install retains 53 strict diagnostics; the rebuilt native Node/build-host suites pass 137 tests with four skips.
- [x] Pin Alpine packaging to the qualified fork commit and validate 637 effective config values (`aports` commit `f6e5bf63c639`).
- [x] Port WSL dxgkrnl onto Linux 7.2.9, pass x64/ARM64 compilation and seven x64 QEMU accelerator tests (`d4764f587115`).
- [x] Publish and verify WSL branch `claude/aphrody-wsl-linux-7.2` at `d4764f587115` using complete history; the existing Microsoft 6.18 branch remains unchanged. Strict checkpatch retains 13 inherited protocol-array errors, with zero new errors.
- [ ] Build, boot and measure the new kernel before host activation.

## Windows version synchronization

- [x] Inventory tracked fork scripts and infrastructure version references.
- [x] Add native `bun:windows` plan/apply/check with stable target 1.4.4.
- [x] Synchronize the coupled runtime and agent plugin source declarations.
- [x] Test targeted rewriting, idempotence and release checksum guards.
- [x] Accept plain stable `bun-v1.4.4` tags in publishers, installers, upgrade and site.
- [x] Pass changed-runtime stable-tag, plugin and Linux deployment helper tests.
- [ ] Qualify production binaries and execute the complete runtime suite.
- [x] Consolidate native Zstd link inputs: target zstd-sys bindings use Bun's pinned 1.5.7 provider; host tools retain Cargo's archive. Native Windows debug audit: zero duplicate strong symbols. Build-unit tests: 22 pass; Zstd runtime tests: 95 pass, 5 skip. Release and other native targets remain to qualify.
- [ ] Commit and push the qualified release candidate.
- [ ] Publish and verify all eligible npm, crates.io, PyPI and vendor products.
- [ ] Publish release assets, GHCR images and activate qualified host deployments.

- [x] Create the native SQLite registry and complete JSON export.
- [x] Import the UV upstream source tree and preserve its licenses and owner rules.
- [x] Add native `bun uv` dispatch and integrated workspace commands.
- [x] Index the pinned CPython and JSC sources with native AST tooling.
- [x] Import Bun/V8/JSC/CPython graphs, with unresolved calls recorded explicitly.
- [x] Record 23 paired runtime comparisons and the qualified CPython JSON patch.
- [x] Qualify Cython Windows/Linux products and real CPython WASI modules.
- [ ] Run the final scoped gates and changed native binary tests.
- [x] Import resolved Cargo graphs and validation artifacts into the registry.
- [x] Define the Buv/PyJS performance, ABI, resource and release plan.
- [ ] Finish fork-only runtime selection and plugin installation.
- [ ] Refresh the complete streamed JSON snapshot after the final gates.
- [ ] Commit and push completed owned batches with source provenance preserved.

- [x] Consolidate Linux syscall output initialization and pointer arguments; strict GNU x64/ARM64 checks have zero diagnostics in the seven owned Linux files. Repair the suite syntax; Windows unsupported-platform test and scoped TypeScript/lint/format gates pass.
- [ ] Qualify this syscall batch on a changed Linux executable; 32 Linux-only tests remain skipped on Windows.

- [x] Consolidate native graph job leases on Bun Guarded locks; five changed-binary graph tests pass (38 assertions), and the owned file has no strict diagnostics on Windows/Linux GNU x64/ARM64. WorkerTerminated error-printing messages remain recorded.

- [x] Qualify Python host FFI signatures and output pointer; all 43 rebuilt-Bun Python tests pass with PyCUDA/Buv GPU and native compiler gates enabled (151 assertions). No strict diagnostic in the host CLI on Windows/Linux GNU x64/ARM64.

- [x] Qualify copyable UV/.NET/MSVC/WinMD terminal invocation enums on four strict targets; 17 rebuilt-Bun native launcher tests pass (91 assertions). The separate .NET path-conversion diagnostic remains.

- [x] Reject unterminated single/double shell quotes; both regressions fail on the installed runtime, native session suite passes 34 tests, valid quote/substitution subset 45 and test-environment subset two. Strict gates have no diagnostics at the corrected sites; three unrelated diagnostics remain in these files on Windows, and the existing test helper Bun.jest type error remains.

- [x] Qualify checked .NET host text conversion and borrowed error translation; five rebuilt-Bun SDK/CLR/TypeScript tests pass (12 assertions), and both owned files have no strict diagnostics on Windows/Linux GNU x64/ARM64. Built-in plugin doctor executes successfully; release/plugin alignment remains pending.

- [x] Preserve native Windows WTF-8 arguments in spawn/common argv and file-based .NET dispatch. Native surrogate regression fails on installed Bun and passes after the fix; 58 changed-binary argument/.NET/Python GPU tests pass (330 assertions). bun_core strict Clippy passes all six targets.
- [ ] Qualify the remaining JavaScript process.argv lone-surrogate projection; the external .NET SDK also normalizes managed arguments, so native transport proof is not a managed round-trip claim.
- [x] Consolider le lanceur du plugin ; strict GNU x64/ARM64 passe, fichier sans diagnostic Windows x64/ARM64, 31 tests natifs et extraction a froid qualifies.
- [x] Qualifier la copie Windows avec libuv et le repli lecture/ecriture ; 195 tests natifs passes sur deux configurations, fichier sans diagnostic strict sur quatre cibles.
- [x] Verifier les 313 fichiers du plugin installe et les entrees activees Codex/Claude sans modifier les authentifications.
- [x] Qualifier les callbacks watchers et sockets cluster Windows sur le binaire modifie et quatre cibles strictes.
- [x] Qualifier les I/O Blob Windows et conserver les obligations de completion POSIX ; 217 tests natifs passes sur deux configurations, trois fichiers sans diagnostic sur quatre cibles.
- [ ] Suivre bun-owner-linux-4e3ddd04da1 et ses recus owned-cache ; qualifier les tests et la provenance du binaire Linux construit depuis le commit publie.
- [x] Qualifier les bindings des pipes nommes TCP/TLS et les erreurs listener ; 123 tests natifs locaux passes, fichier sans diagnostic strict sur quatre cibles.

- [x] Windows IPC buffer ownership: 40 native passes / 99 assertions; four-target ipc.rs strict diagnostics zero.

- [x] Windows shell cp EBUSY state and deferred-task ownership: 30 native passes; GNU strict runtime zero.

- [x] Linux owner release candidate: six changed-engine suites 202 pass, provenance and SHA256 verified; privileged skips and deployment remain outside this proof.

- [x] bunx Win32 pointer contracts and chmod fixture: 9 native passes / 44 assertions, format/lint pass; shared helper type gate remains pending.

- [x] Shared Bun.jest fixture type baseline resolved in test-only declarations; three-suite TypeScript gate passes.

- [x] DBFR isolated Linux candidate delivery and checksum/native smoke verified through Infra; production activation and full release publication pending.

- [x] Windows IPC host and logical drive pointer contracts: 36 native passes; GNU x64/ARM64 strict runtime zero.

- [x] Windows COM and native query output contracts: seven real native passes; GNU strict runtime zero.

- [x] Stripped Linux candidate independently qualified and delivered to isolated DBFR directory, SHA256 and native smoke verified.

- 2026-10-10: owned Node host consolidation: 137 native tests pass, 4 skips; Windows/Linux x64/ARM64 owned Clippy diagnostics zero. Whole Windows 58 diagnostics and reserved Darwin dependency remain; see docs/project/node-host-consolidation-qualification.md.

- 2026-10-10: Buv/PyJS GPU consolidation refreshed on physical RTX 4070: D3D12 WGSL and CUDA exact 37-element outputs pass; provider checksum unchanged. Published shared-host PyCUDA test retained; native Linux hardware, Alpine ABI and activation still open. See docs/aphrody/buv-pyjs-gpu-consolidation.md.

- 2026-10-10: common native internal gate: 883 pass / 33 skip / 3 fail. Two 5-second failures (src/js lint child, parallel JUnit child) reproduce in isolation (9 pass / 2 fail). Missing published Wintrust Admins Send inventory corrected as native-only catalog handles behind Guarded, without VM state; focused VM-thread gate 48 pass / 0 fail. Generated JSON retains the generator's two-space JSON.stringify style; formatter rewrites unrelated baseline entries and was not applied. Full internal gate remains red.

- 2026-10-10: native src/js lint exposed eight duplicate-property errors in PE parsing; property locals and default-export type corrected. Full src/js native lint now zero warnings/errors (230 files, 5.5 seconds). Its single full-tree test ceiling is 15 seconds, retaining exit/result checks; formatted native gate 8 pass / 1 skip / 36 assertions. Scoped formatter/linter pass. TypeScript's builtin dependency closure remains red outside pe.ts; no pe.ts diagnostics after correction. Parallel JUnit is a real shutdown hang: workers report all cases, but no report/exit within a 15-second diagnostic deadline; investigated separately.

- 2026-10-10: Windows parallel worker shutdown fixed: CDB proves final IPC drain reached JSC finalization outside API lock. Existing JUnit regression now 5 pass, parallel/startup suites 40 pass / 8 skips. Complete native internal suite 886 pass / 33 unchanged skips / 0 fail. Strict GNU x64/ARM64 runtime zero; Windows x64/ARM64 retain 58 unrelated diagnostics, runner file zero on all four. Plugin doctor confirms Codex/Claude assets 1.4.4+2fb86b44ed79; native debug reports 1.4.4-debug, explaining stable-version mismatch without content reinstall. See docs/project/parallel-worker-api-lock-qualification.md.

- 2026-10-10: ConPTY output/timer raw pointer contracts: 140 native passes / 14 skips / 10 inherited todos / 389 assertions, plus final formatted source 16 passes / 5 skips / 50 assertions. Strict GNU x64/ARM64 zero; Windows x64/ARM64 58 -> 55 diagnostics, owned files zero. See docs/project/windows-terminal-timer-qualification.md. Full release and remaining platform/hardware gates remain open.

- 2026-10-10: Windows filesystem watcher now borrows the VM facade shared for task submission, preserving the short event-loop mutation owner. Native watcher/abort/close/race/deadlock suites 49 pass / 11 platform skips / 149 assertions; format pass. Strict GNU x64/ARM64 zero, Windows x64/ARM64 55 -> 53 diagnostics; watcher file zero on all four. See docs/project/windows-fs-watcher-vm-qualification.md.

- 2026-10-10: clean published Windows x64 release at 54619ce189c built with default profile; 995 selected release tests pass / 60 skips / zero failures using supported --expose-internals. Native D3D12/CUDA exact vectors and shared Buv/PyJS PyCUDA pass; plugin Codex/Claude update reports up to date. Source clean, SHA256 and cache/wrapper qualification recorded in docs/project/windows-owner-release-qualification.md. Global release/publication/activation and remaining platform gates stay open.

- 2026-10-10: clean release scope zero and exact Next adapter gate 82 pass / 319 assertions / zero failures. Broad fuzzy test selection stopped before declaring application-gate completion; registry isolation remains required. Infra VPS reclaim plan/apply completed; measured available disk 3.45 -> 6.33 GB. DBFR PATH and isolated Linux checksum unchanged.
