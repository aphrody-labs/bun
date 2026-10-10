# Launch and shell pointer qualification

2026-10-10, base f724299688240ce29dc73d900fa2c6ad3eeec0b8. Run-command console output pointers are explicit raw mutable pointers; stored path slices avoid redundant borrowing. GetCurrentDirectoryW capacity/prefix safety and the shell Blob's sole move from ManuallyDrop are documented at their unsafe blocks. Calls, pointer targets and Blob destruction order remain unchanged.

Locked strict bun_runtime Clippy passes on GNU x64/ARM64. Both MSVC targets retain14 unrelated errors, down from18, with zero diagnostics in the two owned files. Rust formatting and diff checks pass. The wider bun_install strict failures remain open.

Changed Windows MSVC14.44 debug owner factory, four jobs/link threads and full symbols: shell output, write/read faults, as-node and Markdown entrypoint suites44 pass/14 inherited skips/0 fail,27 snapshots/121 assertions,6.14 seconds. Linux-only fault injection and the skipped buffer-limit case are not claimed as exercised; a headless run does not prove an interactive console path.

Receipts: tmp/launch-shell-pointer-* and VPS owner-linux-qualification. Exact-file NTFS compression under the factory lock preserved all3000 planned hashes, no deletion/symbol removal, free space4539596800 to8852856832 bytes. Global strict/release/performance/PATH/provider activation/private/hardware delivery remain open.
