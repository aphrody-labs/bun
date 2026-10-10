# Buv / PyJS GPU pipeline

The runnable [example](../../packages/bun-runtime-sdk/examples/buv-pyjs-gpu.ts)
uses the existing shared Python host and canonical GPU provider. It checks
that `buv:python` and `pyjs:python` expose the same constructor and CPython
runs inside the Bun process.

PyCUDA doubles 37 float32 values, synchronizes and copies the result to CPU
memory. The existing Buv GPU export sends that result to wgpu, adds one with
WGSL, reads it back, and passes it to an NVRTC-compiled CUDA kernel that
doubles it again. Every stage checks its exact result. The final values are
`2, 6, 10, ..., 146`.

These are explicit host transfers, including Python's JSON conversion.
PyCUDA creates and releases its own CUDA context; this example does not
establish external-memory interoperability or zero-copy buffers. Allocation
and context cleanup use nested `finally` blocks; Bun host handles use `using`.

## Run with qualified artifacts

Select the shared CPython environment containing NumPy and PyCUDA, its host
library, the GPU-enabled precompiled provider and the matching CUDA toolkit:

- `BUN_PYTHON_EXECUTABLE`: the qualified Python environment executable.
- `BUN_PYTHON_HOST_LIBRARY`: the shared Bun Python host library.
- `BUN_PYTHON_LIBPYTHON`: the matching CPython shared library.
- `PYTHONPATH`: that environment's site-packages directory.
- `BUV_RUNTIME_LIB`: the canonical GPU-enabled `aphrody_ffi` library.
- `CUDA_PATH` and `PATH`: the qualified toolkit and its compiler/DLL directories.

From a native Windows development checkout with toolset 14.44:

```powershell
bun msvc --toolset 14.44 exec -- bun bd --link-threads=1 -j4 packages/bun-runtime-sdk/examples/buv-pyjs-gpu.ts
```

On another qualified native host, use the owner's build factory with the
same example. The example requires an NVIDIA adapter and NVRTC; on Windows
it also requires the selected wgpu backend to be `Dx12`. It fails when a
required capability is unavailable.

## Native qualification — 2026-10-10

The final changed-debug-engine invocation exits zero on the physical NVIDIA
GeForce RTX 4070, backend `Dx12`, driver `32.0.16.1692`. All 37 chained results
match. The existing SDK GPU suite separately passes three tests, six
assertions, zero failures. Package TypeScript, scoped strict oxlint and
Prettier gates pass.

The owner build checkout is based on `988d73b430a` with the recorded fixture,
FileSink and linker patches. Its pinned debug runtime reports revision
`d69d5ebe8b40be626c476871190e2da295325b84`; the executable SHA256 is
`5ca15280b1a1344b650641c28271251ae326a57e5af3b2f37449c47e904639f0`.
This is a qualification of that artifact, not a clean release of this example's
source commit. The provider SHA256 remains
`351e930b6b7fe81f4eca8f405c59e0123e9430e320fb51a5d9782ef6ab7bd6ee`.
Local receipts: `tmp/buv-pyjs-gpu-pipeline-final.log/.exit` and
`tmp/buv-pyjs-gpu-pipeline-sdk-final.log/.exit`.

Native Linux RTX 4070 loading/display/CUDA, Alpine userspace ABI, shared GPU
buffers, comparative performance and complete release activation remain
separate gates. This run starts no WSL instance. NVIDIA's
[WSL guide](https://docs.nvidia.com/cuda/wsl-user-guide/index.html), checked
on the qualification date, requires the Windows display driver and warns
against installing a Linux display driver inside WSL.
