# Terminal features: status

Detection: `src/bun_core/terminal.rs`. Users: `Progress.rs` (install, OSC 9;4 + DECSET 2026), `test_command.rs` and `Coordinator.rs` (bun test), `build_command.rs` (bun build), `ZigStackFrame.rs`, `VirtualMachine.rs`, `ConsoleObject.rs`, `jsc_hooks.rs` and `ast/lib.rs` (OSC 8). Cleanup on exit and signals: `output.rs` (`stdio::restore`, `Bun__restoreWindowsStdio`) and `c-bindings.cpp` (`onExitSignal`). User docs: `docs/runtime/environment-variables.mdx#terminal-features`.

## Verified (Windows x64, debug build)

- `bun bd` builds.
- `bun-debug test test/js/bun/util/inspect-error.test.js -t "OSC 8"`: pipe tests pass.
- `bun-debug test test/cli/test/bun-test.test.ts -t "OSC 9;4"`: pipe tests pass.
- `bun-debug test test/bundler/cli.test.ts -t "terminal"`: tests pass.
- By hand, under ConPTY: OSC 8 (re-emitted with an `id=`), OSC 9;4 and 2026 pass through.

## Remaining

1. Run the tests changed after the last run: the PTY tests in inspect-error (they read link URLs) and bun-test (progress), the bun build snapshot `link index.js:1:11`, and the install tests:
   `build/debug/bun-debug.exe test test/js/bun/util/inspect-error.test.js -t "OSC 8"`
   `build/debug/bun-debug.exe test test/cli/test/bun-test.test.ts -t "OSC 9;4"`
   `build/debug/bun-debug.exe test test/bundler/cli.test.ts -t "terminal"`
   `build/debug/bun-debug.exe test test/cli/install/bun-install.test.ts -t "install progress in the terminal"`
2. Check that each test fails with the system Bun: `USE_SYSTEM_BUN=1 bun test <file> -t <filter>`.
3. `bun run rust:check-all`, for the unix `cfg` in `terminal.rs` and `c-bindings.cpp`.
4. `cargo test -p bun_core terminal`.
