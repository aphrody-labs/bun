<!-- SPDX-License-Identifier: Apache-2.0 -->
# Obscura transfer

Owner directive, 2026-10-11: Bun OS owns Obscura; Aphrody consumes its runtime
capabilities and keeps product behavior. Delivery branch: `obscura`.

- [x] Transfer all nine Obscura crates, extraction and patched Taffy with their
  fixtures, patches, licences and exact source inventory.
- [x] Declare a standalone workspace and keep the parent Bun runtime unaffected.
- [x] Qualify source hashes, standalone dependency resolution, Rust tests and
  strict Clippy on native Windows.
- [ ] Publish the `obscura` branch, pin the product consumer to its exact commit
  and remove the qualified duplicate source trees from Aphrody.
- [ ] Qualify the migrated Aphrody CLI and record the measured source reduction.

Remaining capability work inherited from Aphrody's desktop/web plan: WebGPU hub
integration, JSC parity, layout-backed Playwright actionability and Windows TLS
impersonation. Source transfer does not close those implementation gates.

## Evidence, 2026-10-11

- SHA256 verification: 346 source files, 25,195,518 bytes; only the renderer's
  relative Taffy dependency path is adapted.
- Native Windows nextest with render enabled: 2,247 passed, 7 skipped.
- Strict Clippy with render and all targets: passed. The standalone clippy.toml
  prevents inheritance of the Bun executable's bun_core-specific policies.
- Further compilation and tests run on the VPS by owner directive.
