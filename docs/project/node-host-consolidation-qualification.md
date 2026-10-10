# Node host consolidation qualification

Qualified on native Windows on 2026-10-10. The owned batch makes Windows
OS/filesystem/directory pointer ownership explicit and moves Node path-join
scratch buffers to pool guards. The resulting string is copied before the
guards drop. The module fixture follows the fork's current builtin exports
and evaluates Module.wrap without capturing the fixture's lexical bindings.

The owner factory `bun msvc --toolset 14.44 exec -- bun bd test` ran the
OS, path, module, Windows NT-status readdir and build-host suites: 137 passed,
4 platform skips, zero failures, 615 assertions and one snapshot. The final
formatted fixture was tested again; scoped oxlint and oxfmt passed.

A clean checkout of d69d5ebe8b40be626c476871190e2da295325b84 with this
batch reduced strict Windows x64 Clippy diagnostics from 127 to 58. None
of the four owned Rust files has a primary diagnostic. Serialized strict
Clippy receipts for the identical source files report 58 unrelated errors
on each Windows architecture and zero errors on Linux GNU x64/ARM64.
The process-local sccache opt-out is recorded in the local qualification
plan; global wrapper configuration was preserved.

This is scoped source qualification. Whole-fork Windows Clippy remains
red. Current Darwin qualification depends on a separately reserved
system-package makedev conversion; its isolated patch was not included in
this batch. Older six-target receipts using that patch do not qualify the
current published tree. A complete clean Windows engine build and release
qualification remain pending. The existing Linux candidate is pinned to
4e3ddd04da10d7db3e8a903ec8d352898094fd58 and does not contain this batch.
