//! `bun msvc` as a standalone binary, for `scripts/build.ts` when the bun building Bun predates
//! `bun msvc`: `cargo run --manifest-path vendor/find-msvc-tools/Cargo.toml --bin bun-msvc -- sync`.
//! Its downloads support local paths, `file://` and `http://` only.

#[cfg(windows)]
fn main() {
    std::process::exit(find_msvc_tools::cli::main(std::env::args_os().skip(1).collect(), &[]));
}

#[cfg(not(windows))]
fn main() {
    let args = std::env::args_os().skip(1).collect();
    std::process::exit(find_msvc_tools::cross::cli::main(args, "bun-msvc", &find_msvc_tools::cross::StdFetch));
}
