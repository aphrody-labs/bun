//! Generates runtime-loaded bindings for `bun_emu_host.h`. Every emulator core is its own plugin
//! library exporting the same symbols, so the bindings bind to a library chosen at run time
//! (`BunEmuHost::new(path)`) rather than linking one at build time.
use std::{env, path::PathBuf};

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let header = manifest.join("include/bun_emu_host.h");
    println!("cargo:rerun-if-changed={}", header.display());
    println!(
        "cargo:include={}",
        header.parent().expect("include dir").display()
    );

    let bindings = bindgen::Builder::default()
        .header(header.to_string_lossy())
        .clang_arg("-DBUN_EMU_HOST_BUILD")
        .allowlist_function("bun_emu_.*")
        .allowlist_type("bun_emu.*")
        .allowlist_var("BUN_EMU_.*")
        .dynamic_library_name("BunEmuHost")
        .dynamic_link_require_all(true)
        .derive_default(true)
        .layout_tests(false)
        .generate()
        .expect("bindgen bun_emu_host.h");
    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    bindings
        .write_to_file(out.join("bindings.rs"))
        .expect("write bindings");
}
