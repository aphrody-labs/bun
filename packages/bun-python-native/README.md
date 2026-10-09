# Native Python components

The Bun fork owns these external components. Neither crate is a dependency of
the Bun engine: CPython is loaded only when the caller explicitly uses the host.
No interpreter, model, cache, credential or provider history is copied here.

- `bun-python-host` owns the shared-library loader and the historical
  `aphrody_py_*` C ABI. Its source was transferred unchanged from
  `aphrody-labs/aphrody` at `c58e93d6dc1b4b2d420c3c929a40c67dd071d2f4`.
- `aphrody-rust` owns the PyO3 adapter, retaining the module
  `aphrody.aphrody_rust`, ABI `abi3-py311`, function names and packed buffers.
  Product RAG algorithms remain in the pinned `aphrody-rag-core` dependency.
- Yolo's PyO3 extension remains in the existing `bun-runtime-sdk` package.
- uv, Ruff and the complete vu runtime have a separate package owner; this
  package does not duplicate their resolver, CLI or interpreter distribution.

Build the Python wheel from the Python product checkout with a qualified
`APHRODY_BUN_CHECKOUT`. Native source is resolved there, never copied back.
The host builds separately with `cargo build -p bun-python-host --release`.
It preserves explicit interpreter selection, shared-library identity, error
codes, string destruction, and attach-versus-own lifecycle behavior.

`include/bun_python_host.h` defines ABI version 1. `bun_py_main` accepts UTF-8
arguments including the selected Python executable as `argv[0]`; the Windows
loader converts these to wide arguments. It reuses CPython's complete CLI,
including `-c`, `-m`, stdin and virtual environments, without a second parser.
This is a terminal entry point: stock CPython 3.12 can terminate the process on
`SystemExit`, and `os._exit` retains its native semantics. When CPython returns,
the host status and Python exit result remain separate. Use the evaluator API
for embedded calls; an already initialized interpreter cannot be replaced by
the CLI. Reentrant evaluator calls during CLI execution are rejected.

Qualification: the Windows CPython 3.13 subprocess suite covers Unicode argv
and paths, module/file/stdin execution, exceptions, exits, real venv selection
and reentry. Run this suite against each actual target interpreter; default
tests alone do not qualify CLI execution or a modified Bun binary.

This source transfer alone does not establish installation, runtime activation,
reboot persistence or a performance improvement. No Bun binary addition occurs.
