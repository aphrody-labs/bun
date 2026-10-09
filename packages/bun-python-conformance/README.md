<!-- SPDX-License-Identifier: Apache-2.0 -->
# Native Python conformance harness

This standalone harness calls a real shared host library through ABI v1:

```sh
BUN_PYTHON_HOST_LIBRARY=/absolute/path/to/libbun-python-host.so \\
BUN_PYTHON_LIBPYTHON=/absolute/path/to/libpython.so \\
BUN_PYTHON_EXECUTABLE=/absolute/path/to/python3.12 \\
bun run packages/bun-python-conformance/run.ts
```

The required exports are `bun_py_abi_version() -> u32` and
`bun_py_main(argc, argv, out_exit_code) -> status`. `BUN_PYTHON_EXECUTABLE`
must name the actual installed interpreter; it is passed as `argv[0]` for all
base-prefix checks. The runner creates a real venv and passes its discovered
`bin/python` as `argv[0]` for venv checks. It never infers a Python prefix from
the current working directory. The C driver first calls `aphrody_py_load` with
the explicit libpython path; it does not call `aphrody_py_init`. The host library
remains loaded until the child process exits. Each Python invocation runs in a
separate child process, and the driver forwards the actual `argv` vector and
stdin/stdout/stderr.

`SystemExit` may cause the host's `Py_BytesMain` to terminate the process before
`bun_py_main` returns. In that case the runner asserts the child process's real
terminal status (negative values wrap to the process status byte), and does not
claim the ABI out pointer was returned. Ordinary returns are checked through
the host status and `out_exit_code` marker.

The runner reports JSON with status `open`, `failed`, or `passed`. Missing
libraries, missing ABI exports, absent PyTorch, unavailable CUDA hardware or
drivers, and unprovided model weights stay `skipped`/open; they never count as
runtime activation or successful native dispatch. `activationVerified` is always
false because this harness does not test an installed Bun runtime. CUDA is
tested only when `nvidia-smi` and an NVIDIA device node are both present. Model
inference is not attempted unless a model path is explicitly supplied, and this
batch does not add model loading.

The virtual-environment check creates a temporary environment through native
`-m venv`, calls the ABI with that environment's actual executable, and verifies
`sys.executable`, `sys.prefix`, `sys.base_prefix`, and site-package paths. The
temporary directory is removed after each run.

The actual host used for the 2026-10-09 conformance run and checksum-closed
source provenance are recorded in `native-host-provenance.json`. That run passed
ABI loading, argument and UTF-8 forwarding, `-m`/`sys.path`, real venv creation
and prefix checks, UTF-8 stdio, stdin, `-c`, terminal `SystemExit` behavior, and
traceback preservation. It exited 77/open because PyTorch, CUDA hardware/driver,
and model weights were unavailable. This direct C ABI run does not establish
installed Bun runtime activation. Mixed Python/JavaScript values, Rust FFI,
zero-copy buffer ownership, GC rooting, callbacks, cancellation, and thread
teardown remain separate open gates.
