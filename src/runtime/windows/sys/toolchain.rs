//! Native Windows toolchain discovery shared by `bun msvc` and `bun:windows` `toolchain()`. The
//! resolution (every Visual Studio / Build Tools instance, MSVC toolset, Windows SDK, UCRT,
//! .NET Framework SDK, LLVM, the developer scripts and the vcvars environment) is
//! `vendor/find-msvc-tools` (`toolchain` module).

use find_msvc_tools::toolchain as tc;

/// `x64`/`x86_64`/`amd64`, `x86`/`i686`, `arm64`/`aarch64`, `arm64ec`, `arm` → the Visual Studio name.
pub(crate) fn normalize_arch(arch: &str) -> Option<&'static str> {
    tc::normalize_arch(arch)
}

/// Everything about the toolchain as JSON (the shape of `toolchain()` in `bun:windows` and
/// `bun msvc info`). Empty strings select the defaults.
pub(crate) fn to_json(arch: &str, toolset: &str, sdk: &str, instance: &str) -> String {
    let some = |s: &str| (!s.is_empty()).then(|| s.to_owned());
    tc::report(&tc::Options {
        arch: some(arch),
        toolset: some(toolset),
        sdk: some(sdk),
        instance: some(instance),
        ..tc::Options::default()
    })
}
