<!-- SPDX-License-Identifier: Apache-2.0 -->
# @aphrody/bun-python-toolchain

Private, optional discovery and delegation package for the existing Aphrody Python toolchain. It adds no Rust or JavaScript dependency to Bun's default graph and does no work until one of its scripts is invoked.

## Accepted runtime

The package accepts only an immutable `vu` artifact recorded in `toolchain.receipt.json`. The receipt pins the `vu` manifest digest and source revision, plus the exact uv 0.12.23 and Ruff 0.16.10 source revisions and their upstream lock blobs. It also records the CPython 3.12.15 archive identity. Discovery checks the current host target, manifest pins, executable file hashes and reported versions before exposing a tool. It never falls back to `uv` or `ruff` from `PATH`.

Select an existing artifact explicitly, or let the package use `VU_PREFIX`, `VU_ARTIFACT`, or the current runtime under `VU_HOME` (default `~/.vu`):

```sh
VU_ARTIFACT=/srv/aphrody-build/artifacts/vu/0.1.0-cf385dd2 bun packages/bun-python-toolchain/scripts/inspect.ts
VU_ARTIFACT=/srv/aphrody-build/artifacts/vu/0.1.0-cf385dd2 bun packages/bun-python-toolchain/scripts/inspect.ts --capabilities
```

The first command validates and reports the runtime, uv, Ruff, CPython and the pinned Ruff parser implementation. `--capabilities` explicitly probes packages importable by the artifact's CPython. It reports Cython, Jupyter and tree-sitter-python only as `present-unqualified` unless a future receipt supplies exact accepted pins. It reports PyTorch CPU operation, the compiled CUDA/ROCm backend and actual runtime availability as separate values. A CUDA build without a working CUDA runtime is not reported as usable CUDA.

If `VU_PYTHON` or a project `.python-version` requests uv-managed selection, the optional capability probe skips Python package discovery. It does not ask uv to resolve or install that interpreter. The existing `vu python` behavior is unchanged.

## Delegation

`run.ts` verifies the receipt and delegates arguments to the exact installed sidecar:

```sh
VU_ARTIFACT=/srv/aphrody-build/artifacts/vu/0.1.0-cf385dd2 bun packages/bun-python-toolchain/scripts/run.ts ruff check src
VU_ARTIFACT=/srv/aphrody-build/artifacts/vu/0.1.0-cf385dd2 bun packages/bun-python-toolchain/scripts/run.ts uv --version
```

This package implements no resolver, virtual environment manager, formatter, linter or parser. uv retains its existing package-manager and project-runner behavior. Ruff retains its existing CLI and is the qualified parser implementation; this package does not expose a separate parser API. It does not install CPython, Python packages, PyTorch, model weights, CUDA/ROCm drivers, or any other dependency.

PyTorch and application libraries remain application dependencies selected by Aphrody projects through the existing `vu uv` workflow and project locks. This package only reports what is already importable in the accepted runtime. It never chooses a wheel backend or substitutes for `vu` hardware detection.

## Provenance

`toolchain.receipt.json` is the committed immutable acceptance receipt. It includes SHA-256 digests for the three existing observed runtime manifests at `/srv/aphrody-build/artifacts/vu/0.1.0-{7c3db189,cf385dd2,f0743b52}`. No binary or private receipt is copied into this package. `provenance.json` records hashes of package files and maps the accepted pins to `packages/bun-vu/vendor.json`. uv, Ruff, CPython, and their third-party licenses remain in the runtime artifact and are not redistributed here.
