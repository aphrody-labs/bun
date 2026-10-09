<!-- SPDX-License-Identifier: Apache-2.0 -->
# Native Python conformance harness

This standalone harness calls a real shared host library through ABI v1:

```sh
BUN_PYTHON_HOST_LIBRARY=/absolute/path/to/libbun-python-host.so bun run packages/bun-python-conformance/run.ts
```

The required exports are `bun_py_abi_version() -> u32` and
`bun_py_main(argc, argv, out_exit_code) -> status`. Each Python invocation runs in
its own child process so `-c`, `-m`, stdin, tracebacks, and positive or negative
exit values are observed without reinitializing CPython in one process. The
driver forwards the actual `argv` vector and streams child stdin/stdout/stderr.

The runner reports JSON with status `open`, `failed`, or `passed`. Missing
libraries, missing ABI exports, absent PyTorch, unavailable CUDA hardware or
drivers, and unprovided model weights stay `skipped`/open; they never count as
runtime activation or successful native dispatch. `activationVerified` is always
false because this harness does not test an installed Bun runtime. CUDA is
tested only when `nvidia-smi` and an NVIDIA device node are both present. Model
inference is not attempted unless a model path is explicitly supplied, and this
batch does not add model loading.

The virtual-environment check creates a temporary environment through native
`-m venv`, then calls the ABI with that environment's actual Python executable
path and verifies `sys.prefix`, `sys.base_prefix`, and site-package paths. The
temporary directory is removed after each run.

The parent checkout currently has not yet exposed the requested `bun_py_main`
ABI. Until a real library with ABI version 1 is provided, the runner exits 77
and records all behavioral checks as skipped. Mixed Python/JavaScript value
exchange, Rust FFI, zero-copy buffer ownership, GC rooting, callbacks,
cancellation, and thread teardown remain separate open gates.
