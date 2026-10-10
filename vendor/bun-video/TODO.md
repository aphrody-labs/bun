# Qualification remaining

- [x] Scoped TypeScript, Oxfmt, Oxlint and changed-binary Bun tests: 100 tests across six files, 253 assertions.
- [x] Windows native Cargo check, ten tests, strict Clippy and exact FFV1 roundtrip.
- [ ] Complete unified executable clean-room rendering for both frameworks.
- [ ] Qualify browser-enabled Obscura, native Oxc and M3 providers on a GPU host.
- [ ] Compare equal rendered frames, audio and encode workloads on qualified hosts.
- [ ] Register shared tools in the canonical host after capability qualification.
- [ ] Consolidate dependency locks after both full build closures are qualified.
- [ ] Deliver publicly through an owner-authorized remote with working Git LFS.

Windows standalone compilation and browser-provider linking are blocked by local
disk exhaustion. Automatic review rejected removal of two obsolete owned PE
artifacts with `blocked by policy`; no deletion or bypass was performed.
The existing origin is a public GitHub fork and rejects new LFS object uploads.
The integration is committed locally; its attempted push was rejected before
the remote main changed. No LFS checks or repository visibility were bypassed.
The owner authorized public development and publication on 2026-10-10; a private
destination is no longer required. The GitHub fork LFS restriction remains technical.
