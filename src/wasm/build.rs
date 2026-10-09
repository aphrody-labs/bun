#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros
)]
//! wasm32: cap linear memory at 512 MiB, the range `bun_core::String`'s
//! 32-bit pointer tags can address (tag bits 29..=31).

fn main() {
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("wasm32") {
        println!("cargo:rustc-link-arg-cdylib=--max-memory=536870912");
    }
}
