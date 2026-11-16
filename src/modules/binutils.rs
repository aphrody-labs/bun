//! Binutils names (`nm`, `objdump`, `ar`, ...) run the LLVM tool of the toolchain this binary is built with, found next to
//! the executable, then on `PATH`. The LLVM tools read ELF, PE/COFF, Mach-O and wasm with one code base and are the tools
//! the build already requires, where Rust object/gimli reimplementations would cover a subset of one format family.

use std::ffi::OsString;
use std::path::PathBuf;

const TOOLS: &[(&str, &str)] = &[
    ("addr2line", "llvm-addr2line"),
    ("ar", "llvm-ar"),
    ("c++filt", "llvm-cxxfilt"),
    ("nm", "llvm-nm"),
    ("objcopy", "llvm-objcopy"),
    ("objdump", "llvm-objdump"),
    ("ranlib", "llvm-ranlib"),
    ("readelf", "llvm-readelf"),
    ("size", "llvm-size"),
    ("strings", "llvm-strings"),
    ("strip", "llvm-strip"),
];

/// The LLVM executable that stands for the binutils name, if there is one.
pub fn llvm_tool(name: &str) -> Option<&'static str> {
    TOOLS.iter().find(|(n, _)| *n == name).map(|(_, t)| *t)
}

/// Every binutils name handled.
pub fn names() -> Vec<&'static str> {
    TOOLS.iter().map(|(n, _)| *n).collect()
}

fn find(tool: &str) -> Option<PathBuf> {
    let exe = format!("{tool}{}", std::env::consts::EXE_SUFFIX);
    let beside = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join(&exe)));
    let on_path = std::env::var_os("PATH").into_iter().flat_map(|p| std::env::split_paths(&p).collect::<Vec<_>>()).map(|d| d.join(&exe));
    beside.into_iter().chain(on_path).find(|p| p.is_file())
}

/// Runs `tool` with `args` and returns its exit status; 127 when the tool is not installed.
pub fn run(tool: &str, args: &[OsString]) -> i32 {
    let Some(path) = find(tool) else {
        bun_core::print_errorln!("{tool}: not found beside the executable or on PATH (install LLVM)");
        return 127;
    };
    match std::process::Command::new(path).args(args).status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(e) => {
            bun_core::print_errorln!("{tool}: {e}");
            127
        }
    }
}
