//! First-party modules compiled into the binary and reached by `argv[0]`, by `<bin> applet <name>`, or by
//! `<bin> run` for a script in another language. Each module is a cargo feature, so a build keeps only the ones it
//! selects and LTO sees all of them; nothing is loaded at run time.
//!
//! - `applets`: uutils coreutils, findutils, grep and sed ([`applets`]).
//! - `bash`: the `sh` and `bash` applets on rubash (GNU Bash 5.3 in Rust).
//! - [`binutils`]: `nm`, `objdump`, `ar`, ... run the LLVM tool of the toolchain Bun itself is built with.
//! - [`script`]: language detection of `run` (extension or shebang) and the Rust single-file script runner.

use std::ffi::OsString;

#[cfg(feature = "applets")]
pub mod applets;
#[cfg(feature = "bash")]
pub mod bash;
pub mod binutils;
pub mod script;

/// Runs the module called `name` with `args` (without `argv[0]`), or `None` when no module has that name.
pub fn run(name: &str, args: Vec<OsString>) -> Option<i32> {
    let mut argv = Vec::with_capacity(args.len() + 1);
    argv.push(OsString::from(name));
    argv.extend(args);
    #[cfg(feature = "bash")]
    if matches!(name, "sh" | "bash") {
        return Some(bash::run(name, &argv[1..]));
    }
    #[cfg(feature = "applets")]
    if let Some(applet) = applets::lookup(name) {
        return Some(applet(argv));
    }
    if let Some(tool) = binutils::llvm_tool(name) {
        return Some(binutils::run(tool, &argv[1..]));
    }
    None
}

/// Whether [`run`] knows `name`.
pub fn exists(name: &str) -> bool {
    #[cfg(feature = "bash")]
    if matches!(name, "sh" | "bash") {
        return true;
    }
    #[cfg(feature = "applets")]
    if applets::lookup(name).is_some() {
        return true;
    }
    binutils::llvm_tool(name).is_some()
}

/// Every module name compiled in, sorted.
pub fn names() -> Vec<String> {
    let mut v: Vec<String> = Vec::new();
    #[cfg(feature = "bash")]
    v.extend(["bash".to_string(), "sh".to_string()]);
    #[cfg(feature = "applets")]
    v.extend(applets::names().into_iter().map(String::from));
    v.extend(binutils::names().into_iter().map(String::from));
    v.sort_unstable();
    v.dedup();
    v
}

/// The multicall entry: when the program was started under the name of a module (a link `ls`, `bash`, `nm`...), runs it
/// and returns its status. `argv` is the whole command line, `argv[0]` included.
pub fn run_argv0(argv: &[OsString]) -> Option<i32> {
    let program = std::path::Path::new(argv.first()?);
    let stem = program.file_stem()?.to_str()?;
    if is_bun_name(stem) {
        return None;
    }
    run(stem, argv[1..].to_vec())
}

/// Whether `argv0` (a command-line byte string, path and extension allowed) is a name the Bun CLI answers to itself. They never
/// are a module, and the check keeps the startup of `bun` to a few compares.
pub fn is_bun_argv0(argv0: &[u8]) -> bool {
    let name = argv0.rsplit(|&b| b == b'/' || b == b'\\').next().unwrap_or(argv0);
    let stem = name.strip_suffix(b".exe").unwrap_or(name);
    matches!(stem, b"bun" | b"bunx" | b"node") || stem.starts_with(b"bun-") || stem.starts_with(b"bun_")
}

fn is_bun_name(stem: &str) -> bool {
    is_bun_argv0(stem.as_bytes())
}
