# Bun, UV and Python integration

## GPU and Linux 7.2 migration

- [x] Install and enable the Bun fork plugin in Codex and Claude.
- [x] Publish the RTX 4070 driver, CUDA, Alpine and WSL source audit.
- [x] Correct the D3D12 descriptor-handle ABI and prove native clear/copy on RTX 4070.
- [x] Pass the D3D12 JavaScript gate with the rebuilt Bun executable.
- [x] Qualify the existing wgpu probe with exact compute readback on hardware.
- [x] Expose the shared GPU SDK through Buv and pass the six provenance/export gates.
- [ ] Qualify PyCUDA computation through the shared Buv/PyJS CPython host.
- [ ] Port the Aphrody Rust kernel patches onto pinned upstream Linux 7.2.9.
- [ ] Pin Alpine packaging to the qualified fork commit and validate effective configs.
- [ ] Port and qualify the WSL dxgkrnl path independently of native NVIDIA modules.
- [ ] Build, boot and measure the new kernel before host activation.

## Windows version synchronization

- [x] Inventory tracked fork scripts and infrastructure version references.
- [x] Add native `bun:windows` plan/apply/check with stable target 1.4.4.
- [x] Synchronize the coupled runtime and agent plugin source declarations.
- [x] Test targeted rewriting, idempotence and release checksum guards.
- [x] Accept plain stable `bun-v1.4.4` tags in publishers, installers, upgrade and site.
- [x] Pass changed-runtime stable-tag, plugin and Linux deployment helper tests.
- [ ] Qualify production binaries and execute the complete runtime suite.
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
