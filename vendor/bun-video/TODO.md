# Qualification remaining

- [x] Scoped TypeScript, Oxfmt, Oxlint and changed-binary Bun tests: 100 tests across six files, 253 assertions.
- [x] Windows native Cargo check, ten tests, strict Clippy and exact FFV1 roundtrip.
- [ ] Complete unified executable clean-room rendering for both frameworks.
- [ ] Qualify browser-enabled Obscura, native Oxc and M3 providers on a GPU host.
- [ ] Compare equal rendered frames, audio and encode workloads on qualified hosts.
- [ ] Register shared tools in the canonical host after capability qualification.
- [ ] Consolidate dependency locks after both full build closures are qualified.

Windows standalone compilation and browser-provider linking are blocked by local
disk exhaustion. Automatic review rejected removal of two obsolete owned PE
artifacts with `blocked by policy`; no deletion or bypass was performed.
