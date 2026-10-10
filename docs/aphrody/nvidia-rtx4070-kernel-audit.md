# RTX 4070: native Linux, CUDA and WSL qualification

Audit date: 2026-10-10. This document records source evidence and required gates;
it does not certify an installed Linux driver or a booted replacement kernel.

## Current evidence

The owner workstation exposes an NVIDIA GeForce RTX 4070, PCI ID `10de:2786`,
with Windows driver `616.92`. A standalone build of the actual D3D12 sys module
creates a feature-level 12_0 device, clears a 4×4 RGBA8 target and verifies every
returned pixel, then copies and verifies 37 bytes. The uncorrected COM descriptor
return exits with an access violation; the output-pointer correction passes.
The complete Bun JavaScript qualification is still pending.

The selected Aphrody Linux checkout is on `aphrody-bun`, Linux 6.18.55, with
the `bun_accel` changes. The WSL checkout is on `linux-msft-wsl-6.18.y` and has
unrelated dirty netfilter files. Preserve those edits. Its expected Aphrody
config is absent on that branch: the WSL build must select and inspect the
actual integration branch before changing its configuration.

## Driver and kernel boundaries

[NVIDIA's 615.78.08 source release](https://github.com/NVIDIA/open-gpu-kernel-modules/tree/615.78.08)
lists the RTX 4070 (`2786`) and supports Turing and newer GPUs. Its Linux interface
is in `kernel-open/`, including nvidia, nvidia-modeset, nvidia-drm and nvidia-uvm;
the OS-independent implementation is in `src/`. Kernel modules, GSP firmware and
userspace components must come from the same driver release. Build the interface
against the target kernel's configuration and toolchain. Keep the release pinned:
the live README and an independently cached `main` Kbuild returned different
driver versions during this audit.

[Kernel.org](https://www.kernel.org/) currently lists stable 7.2.9 and mainline
7.3-rc6. Moving from the fork's 6.18.55 to stable 7.2.9 requires integrating the
existing Aphrody patches and requalifying their APIs; a version-string change
cannot establish that migration.

[NVIDIA's CUDA Linux installation matrix](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/index.html)
includes Ubuntu 26.04.1, kernel 7.0.0-31, GCC 15.2 and glibc 2.43. That validation
does not establish the same result on a custom 7.2.9 kernel or Alpine musl.
Open kernel-module source does not make the proprietary CUDA userspace libraries
musl-native. The Alpine userspace ABI needs its own qualification.

## WSL path

[NVIDIA's WSL guide](https://docs.nvidia.com/cuda/wsl-user-guide/index.html)
requires the Windows display driver and the projected CUDA library. Do not
install Linux NVIDIA display-driver packages in WSL. Preserve the Microsoft
dxgkrnl/VMBus implementation and verify `/dev/dxg`, projected libraries and an
actual CUDA workload with exact output. A generic upstream Linux kernel with
NVIDIA PCI modules is not equivalent to the WSL GPU path.

The existing Alpine WSL notes report a glibc `libd3d12.so` exception under musl,
with software rendering as the qualified result. This remains a userspace ABI
defect until a hardware D3D12/Dozen workload passes. Do not mark native GPU support
complete from DXCore adapter enumeration alone.

## Patch rules and delivery gates

Follow [Linux coding style](https://docs.kernel.org/process/coding-style.html)
and [patch submission rules](https://docs.kernel.org/process/submitting-patches.html):
one functional problem per patch, preserve provenance, include the owner sign-off,
run checkpatch and inspect warnings, build the affected configurations and execute
the relevant selftests. NVIDIA publishes no single style guide; its
[contribution rules](https://github.com/NVIDIA/open-gpu-kernel-modules/blob/615.78.08/CONTRIBUTING.md)
require following neighboring implementation style and reject cosmetic-only work.

Remaining gates:

- Consolidate and pass the changed Bun binary's D3D12 and Windows tests, scoped
  TypeScript/lint/format checks and required cross-target Rust checks.
- Inspect CUDA's actual owner and consumer paths; qualify a real allocation,
  kernel launch, synchronization and byte-exact result on the RTX 4070.
- Merge Linux stable 7.2.9 into an isolated fork integration checkout; build
  kernel, modules, initramfs and the retained Aphrody selftests.
- Build one pinned NVIDIA open-module release against that kernel, matching GSP
  firmware/userspace, and qualify boot, display and CUDA on a native Ubuntu host.
- Integrate the WSL-specific source branch separately; build its kernel and module
  VHDX, then qualify dxg/CUDA and hardware rendering on an authorized WSL target.
- Qualify Alpine's CUDA/D3D12 userspace ABI independently; publish and activate only
  artifacts that passed their corresponding hardware and host gates.

The local Windows workflow does not start WSL or replace the workstation kernel.
