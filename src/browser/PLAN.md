<!-- SPDX-License-Identifier: Apache-2.0 -->
# Bun browser integration

Owner directive, 2026-10-11: Bun OS owns the shared engines; Aphrody consumes runtime
capabilities and keeps product behavior. Delivery branch: `obscura`.

- [x] Transfer all nine Bun crates, extraction and patched Taffy with their
  fixtures, patches, licences and exact source inventory.
- [x] Declare the intermediate browser library workspace.
- [x] Integrate all 15 browser libraries into the single root Bun Cargo
  workspace; remove intermediate child manifest, lockfile, toolchain and
  Cargo configuration. Root dependency resolution is the current owner.
- [x] Declare root `browser-tests` profile: inherits `dev`, `debug = 0`,
  `incremental = false`, `split-debuginfo = "off"`.
- [x] Qualify source hashes, standalone dependency resolution, Rust tests and
  strict Clippy on native Windows.
- [x] Publish the initial import on the `obscura` branch at
  `e4bcb7dc4d89304c1689222fd0af3cb07c5e4ee8`.
- [x] Qualify the initial import on Linux: 2,250 passed, 5 skipped; check and
  strict Clippy passed. This does not qualify later engine fusion.
- [ ] Qualify the new root dependency graph and Cargo-generated root lockfile
  with serialized scoped check/test/strict Clippy on the VPS; initial standalone
  receipts do not qualify this integration.
- [ ] Qualify shared native HTML, CSS and JSC implementations. Use one `bun`
  executable, CLI, FFI, MCP registry and existing agent plugin.
- [ ] Switch product consumers only after their replacement behavior is stable
  and remove the qualified duplicate source trees from Aphrody.
- [ ] Qualify the migrated Aphrody CLI and record the measured source reduction.

Remaining capability work inherited from Aphrody's desktop/web plan: WebGPU hub
integration, JSC parity, layout-backed Playwright actionability and Windows TLS
impersonation. Source transfer does not close those implementation gates.

## Evidence, 2026-10-11

- Initial SHA256 verification: 346 source files, 25,195,518 original bytes.
  Later integration hashes record identity and path adaptations separately.
- Native Windows nextest with render enabled: 2,247 passed, 7 skipped.
- Initial standalone strict Clippy with render and all targets: passed; that
  import used its own lint baseline. The unified root graph and new profile
  require a fresh scoped Clippy receipt.
- Further compilation and tests run on the VPS by owner directive.
- Current fork manifests use 1.4.4; the consulted public upstream release
  baseline is 1.4.3. Neither number establishes candidate artifact qualification.
- Declared factory allocation for the new lot:
  `/home/ubuntu/builds/bun-os-factory`, 107 GiB disk and 45 GiB RAM. Respect live
  resource availability, leases and serialized gates. New integration gates
  remain unqualified until their VPS receipts are recorded.

The complete actionable queue is [TODO-BUN](../../TODO-BUN.md); historical
research and upstream notices do not establish current runtime qualification.
