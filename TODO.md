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
- [ ] Finish compiler strict Rust gates: 43 native Python tests and six provenance tests pass; bun_runtime still reports 272 diagnostics outside the owned compiler and native safety paths. The sccache command-length opt-out remains process-local.
- [ ] Finish strict validation and delivery for the Node pointer/pool batch; bun_runtime checks pass on all six targets after local host/rootfs portability fixes. The rootfs Darwin fix remains pending with 53 bun_install strict diagnostics; 129 native Node tests previously pass with four skips.
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
