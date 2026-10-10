# Windows handle and WinRT apartment qualification

Qualification date: 2026-10-10, native Windows x64.

Toast notification calls now balance each successful `RoInitialize`, including `S_FALSE`, with `RoUninitialize`. The cleanup guard is created before the local COM references, so those references are released first. `RPC_E_CHANGED_MODE` does not acquire an initialization reference and leaves the caller's STA apartment intact. This follows Microsoft's [RoInitialize lifetime contract](https://learn.microsoft.com/en-us/windows/win32/api/roapi/nf-roapi-roinitialize).

Previously, even rejecting malformed toast XML left an initially uninitialized thread in an MTA. The regression tests inspect the real COM apartment through `CoGetApartmentType` in fresh child processes. They cover uninitialized threads, an existing MTA, and an existing STA. The installed runtime fails the first two cases. The changed native binary passes all three and the existing WinRT projection tests: five passes, 21 assertions.

Job Object and NTFS handle registries use Bun's `HashMap` and `Guarded` primitives. Catalog administration also uses `Guarded`; locks release through RAII. Win32 output pointers are explicit, process snapshot fields are initialized without `mem::zeroed`, and UTF-16 decoding preserves the previous handling of trailing incomplete units.

The broader Windows and WinRT suites passed 31 tests with one existing non-Windows skip and 157 assertions. This includes real NTFS journal/MFT enumeration, Job Objects, process and service inspection, catalog lookup, and D3D12 readbacks. The NTFS test took approximately 177 seconds on this volume. TypeScript, oxlint, Prettier, Rust formatting and the native duplicate-symbol audit passed for the owned changes.

The seven changed Rust files have no strict Clippy diagnostics on Windows x64 or ARM64. Whole-runtime strict Clippy still fails with 184 diagnostics elsewhere, down from 235 before this batch. ARM64 execution, release publication and host activation remain unqualified by this batch. Existing dirty Windows test/type declarations and unrelated staged delivery files were preserved.
