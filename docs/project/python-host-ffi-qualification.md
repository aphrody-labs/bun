# Python host FFI qualification — 2026-10-10

Python CLI loading retains host ABI v1 and the explicitly selected shared
library. The loader is a safe private function; each symbol conversion and call
keeps its local unsafe contract. Function signatures match the producer-owned
`packages/bun-python-native/crates/bun-python-host/include/bun_python_host.h`.
The library stays owned by the static host API while its function pointers are
used. The CLI exit-code output now uses an explicit raw pointer.

The rebuilt Windows executable passes all 43 existing Python CLI tests,
151 assertions, with PyCUDA, Buv GPU and Python compiler gates enabled. The
suite includes shared-host PyCUDA computation, in-process Python/JavaScript,
SQLite graph consumers and real Cython/Nuitka extension/executable artifacts.
This does not establish a shared CUDA context or zero-copy GPU interoperability.

Strict Clippy has no diagnostics in `python_command.rs` on Linux GNU x64/ARM64
and Windows x64/ARM64. Whole-runtime gates still fail elsewhere: 19 diagnostics
on each GNU target and 158 on each Windows target. Cross checks do not establish
Linux runtime execution or host activation.

Receipts: `tmp/python-host-native-gpu.log` and
`tmp/python-host-clippy-{linux,windows}-{x64,arm64}.jsonl`.
The GPU provider DLL SHA-256 remains
`351e930b6b7fe81f4eca8f405c59e0123e9430e320fb51a5d9782ef6ab7bd6ee`.
Release distribution, installed plugin alignment and deployment remain pending.
