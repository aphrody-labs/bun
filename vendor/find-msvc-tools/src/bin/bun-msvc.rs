//! `bun msvc` as a standalone binary, for `scripts/build.ts` when the bun building Bun predates
//! `bun msvc`: `cargo run --manifest-path vendor/find-msvc-tools/Cargo.toml --bin bun-msvc -- sync`.

#[cfg(windows)]
fn main() {
    std::process::exit(find_msvc_tools::cli::main(std::env::args_os().skip(1).collect(), &[]));
}

#[cfg(not(windows))]
fn main() {
    eprintln!("error: bun msvc is only available on Windows");
    std::process::exit(1);
}
