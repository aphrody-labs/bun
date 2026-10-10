# Buv / PyJS GPU consolidation — 2026-10-10

The Bun fork reuses the canonical Aphrody GPU provider through
`packages/bun-runtime-sdk/src/gpu.ts`; `packages/buv/gpu.ts` re-exports it.
Importing the SDK does not activate a driver. Explicit `GpuRuntime.load()`
selects the precompiled provider. Windows adapter selection prefers D3D12
on the NVIDIA device.

A fresh changed-engine run through `bun msvc --toolset 14.44 exec -- bun bd`
selected the RTX 4070, backend Dx12, driver 616.92. It compiled and dispatched
WGSL and CUDA kernels, synchronized, read back and checked all 37 results.
Both returned exactly 2, 4, ..., 74. CUDA reports 13.4, compute capability
8.9 and 46 multiprocessors. The provider SHA-256 is unchanged:
`351e930b6b7fe81f4eca8f405c59e0123e9430e320fb51a5d9782ef6ab7bd6ee`.
Receipt: `tmp/gpu-consolidation-native.log` (exit zero).

Published test 1dd06393befb15ae9d54f5d188a32fc0c6240e58 combines
`buv:python` and `pyjs:python` in one process. It verifies their constructor
identity, CPython's PID, real PyCUDA compilation/launch/readback, then the
canonical WGSL/CUDA SDK. The existing full Python receipt records 43 passes
and 151 assertions with GPU/compiler gates enabled. This earlier receipt is
not a fresh run of the entire Python suite. See
[host FFI qualification](../project/python-host-ffi-qualification.md).

CPython is shared by Buv/PyJS; PyCUDA creates its own CUDA context. Passing
these tests does not establish shared device buffers, zero-copy transfer,
external-memory interoperability, or measured speed/memory improvements.

## Linux and WSL contracts

[NVIDIA's WSL guide](https://docs.nvidia.com/cuda/wsl-user-guide/index.html)
was checked again on 2026-10-10. WSL uses the Windows display driver and its
projected CUDA library; Linux NVIDIA display-driver packages must not replace
that path. Managed-memory support and pinned-memory capacity have documented
limitations. Applications must query supported capabilities.

[NVIDIA's open module source](https://github.com/NVIDIA/open-gpu-kernel-modules)
provides the native Linux kernel interface. Native Linux module/GSP/userspace
version matching remains a separate gate from WSL dxgkrnl and from the
Windows D3D12 qualification above. Follow
[Linux coding style](https://docs.kernel.org/process/coding-style.html) and
[Rust kernel guidance](https://docs.kernel.org/rust/general-information.html).

A successful kernel/module build or QEMU selftest does not qualify physical
RTX 4070 boot/display/CUDA on the customized kernel. Alpine's CUDA userspace
ABI, hardware Linux validation, complete release artifacts and production
activation remain open. No WSL instance was started by this qualification.
The previous [kernel audit](nvidia-rtx4070-kernel-audit.md) is an initial
snapshot; its pending Windows-compute statements are superseded by this
scoped hardware evidence.
