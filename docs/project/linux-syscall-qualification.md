# Linux syscall qualification — 2026-10-10

This batch consolidates the existing `bun:linux` bindings; it does not change the
kernel ABI or activate a new kernel on a host.

- Capability and wait-status arguments use explicit raw pointers.
- `statfs` and `fstat` outputs use `MaybeUninit`; they are read only after a
  successful syscall. The io_uring probe initializes its integer fields explicitly.
- The netlink address retains its required zeroed kernel-port representation.
- Error-message path formatting uses `BStr`; the separately stored path bytes
  remain unchanged.
- The existing Linux test suite had an unterminated string in the orphan-reaping
  assertion. The expected newline is now escaped and the file is formatted.

Strict Clippy on Linux GNU x64 and ARM64 reports no diagnostics in these seven
Linux files. Both whole-runtime gates still exit 101 with 27 diagnostics in other
modules, down from 37. These are compiler checks, not Linux runtime evidence.

The changed native Windows executable passes the unsupported-platform test:
one pass, 32 Linux-only skips, three assertions. Scoped TypeScript, oxlint and
oxfmt checks pass. Linux syscall execution remains pending a qualified Linux
build; the Windows skips do not establish it.

Local receipts: `tmp/linux-syscall-clippy-{x64,arm64}.jsonl`,
`tmp/linux-syscall-native-windows.log` and `tmp/linux-syscall-types.log`.

Host activation remains pending. Infra sync previews currently resolve an
incorrect inventory root. A selected-root fix is isolated in
`tmp/infra-root-matrix-owned.patch`, because its source file is reserved by
another work batch. The VPS source checkout is still at `c6654dfe852e` and has
17 GB free; its existing executable does not include this batch.
