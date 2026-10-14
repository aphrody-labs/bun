# Native compiler integration

Bun owns its parser, AST, printer, transforms, quality tools, language services and shared collections under `src/`. The root Cargo workspace builds these owners directly. Required source notices and license files stay with the integrated code.

The build uses these source owners directly; it does not create a separate compiler workspace or fetch a compiler toolchain during the build. `bun lint`, `bun fmt`, `bun n2b` and `bun migrate` dispatch to linked Rust implementations.

Validate changes with the affected owner tests and commands executed through `bun bd`. Source integration alone does not qualify a native runtime or release.
