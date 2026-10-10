# Buv runtime packaging

`@aphrody/buv` packages the selected Bun fork's native JavaScriptCore runtime and embedded UV 0.12.24. PyJS names the combined JavaScript and Python language surface. The runtime SDK remains implemented in `packages/bun-runtime-sdk`, exposed here through `@aphrody/buv/runtime-sdk`, `/runtime-artifact`, and `/runtime-release` without installation or activation at import time.

## Native core contract

Build the core with the repository owner factory. Then provide its absolute executable path:

```sh
bun scripts/core.ts <native-core>
bun scripts/forge.ts --buv <native-core>
```

Forge defaults to core qualification, assembly and smoke. Qualification executes `buv:graph`, captures Bun/JSC source revisions and the executable SHA-256, and requires the embedded `buv uv --version` to report exactly UV 0.12.24. Forge never compiles another UV or legacy launcher. Network fetching is optional and requires `--steps fetch,core,assemble,smoke --allow-network`; embedded `../../vendor/uv` is read without cloning or moving the workspace's source tree.

Artifacts contain identical `bin/buv` and `bin/pyjs` core binaries, with `.exe` on Windows. UV consumers invoke `buv uv <command>`. No upstream `bun` or `uv` executable is installed into the artifact's `bin`. Each immutable artifact records the core, component pins, target, file hashes and symlinks in `share/buv/manifest.json`.

The inherited CPython prefix can be included only for its pinned Linux target. A mismatched target is refused. Ruff may be included as a separately packaged component from the supplied release directory; this does not qualify Ruff as embedded in the core. Packaging and a passed graph/UV gate do not qualify the shared PyJS interpreter ABI, extension imports, wheels, or unported legacy commands. Those require the core's own native integration tests. `buv.json` retains `sharedHostReady: false` until that gate passes.

## Installation and tests

`@aphrody/buv/gpu` exposes the existing optional `GpuRuntime` SDK for the shared
Aphrody wgpu/CUDA hub. Importing it does not load or activate a native provider.
`GpuRuntime.load({ libraryPath })` requires a qualified provider with `gpu.info`
and `gpu.wgsl`; CUDA additionally requires `gpu.cuda` and working driver/NVRTC
libraries. This reuses the SDK ABI and its cancellation, bounds and lifecycle.
PyCUDA uses the separate shared CPython host through `buv:python` / `pyjs:python`.
It requires a CUDA toolkit and an independently qualified Python extension.

The opt-in native gate is `BUN_TEST_PYCUDA=1 bun bd test
test/js/first_party/runtime/python-cli.test.ts -t PyCUDA`, with the factory's
exact `BUN_PYTHON_EXECUTABLE`, `BUN_PYTHON_HOST_LIBRARY` and
`BUN_PYTHON_LIBPYTHON` paths. Embedded Python reads `PYTHONPATH` for packages
installed in a selected venv; `CUDA_PATH` selects the Windows toolkit and its
DLL directory. Supply NVCC and MSVC through the qualified native environment.
It computes and verifies GPU results in the Bun process; a skipped gate does
not qualify PyCUDA or shared device buffers. On 2026-10-10 the native Windows
gate passed with PyCUDA 2026.1, CUDA 13.4.1 and CPython 3.12.15, with the CUDA
compiler cache disabled and all 37 integer results checked.

`bun scripts/install.ts --from <artifact>` computes the install plan. `--apply` verifies the native core before activation and installs under `$BUV_HOME/runtime/<target>/`, default `~/.buv`. `current` activation and `previous` rollback are atomic; existing immutable artifacts are verified before reuse. `--rollback --apply` selects the previous artifact. Receipts use `$BUV_RECEIPT_DIR`, default `~/.buv/receipts`; forging does not activate a runtime.

Use the coordinator's single final gate pass for package tests. Set `BUV_TEST_EXECUTABLE` to the owner-built executable to enable the native graph/UV qualification test. Artifact-dependent legacy parity tests require their explicitly configured fixtures and do not establish core qualification when skipped. `scripts/bench.ts` invokes embedded UV asynchronously through `buv uv`, records the actual executables, and accepts explicit baseline `--before-python` / `--before-uv` paths.

## Preserved predecessor sources

The complete former `packages/bun-vu` tree now lives here, including standalone parity source crates `crates/buv` and `crates/buv-runtime`, Python compile/Hugging Face helpers, installer, manifests and benchmarks. These crates preserve functionality for porting; they are outside Bun's default workspace and are not the canonical core built by forge.

`provenance.json` preserves the original source revision `6ea52f1aada7269d81470dd9d93144555610868e`, old path/hash maps, notices, acceptance evidence and historical UV 0.12.23 pin. Its separate `migration` inventory hashes current Buv files. `TRANSFER-RECEIPT.md` is a dated historical receipt, not evidence for the new binary. The Apache license and original notices are retained. Current UV provenance points to `vendor/uv` at upstream revision `f3e56e16e0302e26ea456cb51b676b35958572a0`; predecessor Ruff, PyO3 and python-build-standalone pins remain unchanged.
