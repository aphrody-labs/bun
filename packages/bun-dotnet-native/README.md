# Native CLR host

`bun-dotnet-host` hosts .NET in the calling process through `hostfxr`, the way
`bun-python-host` hosts CPython. `hostfxr` is opened at run time from the
installed .NET; nothing is linked against a .NET install.

- Lookup (`locate`): `BUN_DOTNET_HOSTFXR`, `BUN_DOTNET_NETHOST` (its
  `get_hostfxr_path`), then the `nethost` order (`DOTNET_ROOT_<ARCH>`,
  `DOTNET_ROOT`, registered install location, default install location), then
  `dotnet` on `PATH` and `~/.dotnet`. The newest `host/fxr/<version>` wins.
- Muxer (`Hostfxr::main`, `bun_dotnet_main`): `hostfxr_main_startupinfo` with the
  arguments `dotnet.exe` passes, so `dotnet build`, `dotnet run app.cs`, ... run
  inside Bun. Bun links the rlib for `bun dotnet` and the `dotnet` argv0 alias.
- CLR (`Hostfxr::runtime`, `bun_dotnet_initialize`): one runtime per process,
  `hostfxr_initialize_for_runtime_config`, then
  `load_assembly_and_get_function_pointer`, `get_function_pointer` and
  `load_assembly`. `bun:dotnet` binds `[UnmanagedCallersOnly]` methods through
  it; `node-api-dotnet` (packages/bun-dotnet) shares the same runtime.

- Installs (`inventory`): every root from `DOTNET_ROOT*`, the registry
  `InstalledVersions` keys (32/64-bit views), `/etc/dotnet/install_location*`,
  default and user locations and `PATH`, with their SDKs, shared frameworks,
  `hostfxr` versions, workloads and the .NET Framework (NDP) versions.
- Selection (`select`): `global.json` with the `sdk_resolver` rules and
  `.runtimeconfig.json` roll-forward with the `fx_resolver` rules.
- `env` (cached snapshot, shell renderers), `info` (`dotnet --info` without a
  process) and `releases` (release metadata, archive selection) back
  `bun dotnet env|sync|info|resolve|setup` (src/runtime/dotnet/tools.rs).

`include/hostfxr/` holds `hostfxr.h`, `nethost.h` and `coreclr_delegates.h` from
dotnet/runtime (MIT, `include/hostfxr/LICENSE.TXT`) for C consumers;
`include/bun_dotnet_host.h` is the C ABI of the cdylib (`c-abi` feature).

```sh
cargo rustc --release -p bun-dotnet-host --crate-type cdylib   # target/release/bun_dotnet_host.{dll,so,dylib}
bun test ./test                # builds a C# fixture with the .NET SDK, calls it through the cdylib
```
