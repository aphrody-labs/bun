# Native agent-plugin launcher qualification — 2026-10-10

The embedded plugin launcher uses Bun's RAII file and directory APIs for archive
reads, staging writes, cleanup and atomic rename. It executes the same Bun
executable through the native synchronous spawn owner, preserving encoded OS
arguments, inherited standard streams, explicit --from/--root overrides and
BUN_BE_BUN=1. Owned environment strings and their pointer array remain alive
until the child exits; Windows retains the full native exit code.

The changed Windows executable passes all 31 existing plugin tests with 810
assertions. Installation, update and uninstall preserve unrelated plugins in
temporary homes. A separate cold extraction run passes one test with 17 assertions
and creates the extracted archive under a dedicated temporary directory.

Strict Clippy passes the complete bun_runtime crate on Linux GNU x64 and ARM64.
The launcher has zero diagnostics on Windows x64 and ARM64; 139 diagnostics
remain elsewhere in the Windows runtime. Linux execution, clean-clone release
qualification and installed provider-plugin alignment remain pending.

Receipts: tmp/plugin-launcher-native.log, tmp/plugin-launcher-cold-native.log and
tmp/plugin-launcher-*.jsonl with their exit-code files. No provider authentication
or shared provider settings are changed by these tests.
