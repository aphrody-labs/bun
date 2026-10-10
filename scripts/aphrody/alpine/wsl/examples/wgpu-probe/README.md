# wgpu hardware qualification

This standalone wgpu 30.0.1 probe keeps GUI dependencies outside Bun's engine.
`--headless` enumerates adapters, creates a device, executes a WGSL compute
shader over 37 integers and verifies every value after GPU readback. The window
mode retains the existing surface/presentation test.

Build through the selected host's serialized Cargo factory. On native Windows:

```powershell
bun <aphrody-checkout>/scripts/build/rust/cargo-serial.ts --msvc build --manifest-path <probe>/Cargo.toml --release --locked
$env:CLIPPY_CONF_DIR = '<probe>'
bun <aphrody-checkout>/scripts/build/rust/cargo-serial.ts --msvc clippy --manifest-path <probe>/Cargo.toml --release --locked --no-deps -- -D warnings
$env:WGPU_BACKEND = 'dx12'
<factory-target>/release/aphrody-wgpu-probe.exe --headless
```

Record the selected adapter's name, backend, device type and driver. A successful
software adapter run does not qualify NVIDIA hardware. On 2026-10-10, the native
Windows run selected RTX 4070 / Dx12 / DiscreteGpu, driver 32.0.16.1692, and
verified all 37 results. Release build and strict Clippy passed.

For Alpine WSL, reuse the existing WSLg userspace setup and backend overrides.
This Windows result does not certify WSL's projected D3D12 libraries on musl.
