# Bun Windows 11 open platform

## Target

Provide a modern, open-source Windows 11 development and application layer that can be orchestrated from Windows, Linux or macOS without adopting Wine as an emulation core, MSYS2 as a GNU userland, or MinGW as the Windows ABI owner.

The model is `native Windows ABI + portable orchestration`:

- Bun/Rust own process, filesystem, network, FFI, package and build orchestration.
- Win32, COM, WinRT, Windows App SDK and ConPTY remain the native ABI.
- `bun msvc` owns MSVC/SDK discovery and cross-target sysroots; `bun winmd` owns generated Rust and Bun FFI projections.
- `bun msvc vcpkg` owns manifest-mode native dependencies, target triplets and a shared binary cache.
- `bun lsp` routes C# to the open-source Roslyn server.
- PowerShell and Windows Terminal stay independently buildable applications. Bun Shell and `bun:rio` converge through tested behavior and terminal protocols, not source amalgamation.
- Fluent UI and the .NET object bridge are optional distribution payloads.

## Activation boundary

`@aphrody/bun-windows-suite` groups `bun:windows`, `bun:winrt`, `bun:winui` and `bun:dotnet` behind explicit activation. `BUN_WINDOWS_CAPABILITIES` defaults to empty. The source/build payloads are pinned checkouts fetched by `bun run vendor:setup`: `vendor/powershell`, `vendor/roslyn`, `vendor/windows-terminal`, `vendor/vcpkg` and `vendor/fluentui`.

The package is the distribution boundary, not proof of binary extraction. Moving a capability out of the executable requires before/after release-size, startup, RSS and behavior qualification.

Build the pinned applications through the shared orchestration entry point:

```powershell
bun scripts/aphrody/windows-suite.ts status
bun scripts/aphrody/windows-suite.ts build vcpkg
bun scripts/aphrody/windows-suite.ts build roslyn
bun scripts/aphrody/windows-suite.ts build powershell
bun scripts/aphrody/windows-suite.ts build terminal
```

Roslyn uses `bun dotnet`; Windows Terminal uses `bun msvc exec`; vcpkg disables telemetry while bootstrapping. PowerShell retains its upstream `build.psm1` owner and is launched with `pwsh` rather than reimplemented.

## Compatibility contract

Compatibility is layered and independently gated:

1. Win32/WinRT ABI and metadata projection.
2. PowerShell process invocation, quoting, environment and pipeline interop.
3. ConPTY/VT behavior shared by Bun Terminal, Rio and Windows Terminal.
4. MSVC, CMake and vcpkg native dependency builds, including Rust build scripts.
5. .NET hosting, NativeAOT/UnmanagedCallersOnly FFI and Roslyn LSP.
6. WinUI 3 and Fluent resources.

“Full compatible” is reached only by passing the relevant upstream conformance suites; vendoring or successful compilation alone is not compatibility evidence.
