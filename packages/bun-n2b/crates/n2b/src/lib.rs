// SPDX-License-Identifier: Apache-2.0

mod analyze;
mod app_cmd;
mod bin_cmd;
mod bunpp_cmd;
mod cli;
mod commands;
mod linux_cmd;
mod patch;
mod rust_cmd;
mod scaffold_fs;
#[cfg(test)]
mod schema_test;
mod subprocess;
mod toolchain;
mod wasm_cmd;
mod win32_cmd;

use std::{ffi::OsString, process::ExitCode};

/// Run N2B inside an embedding process with an explicit argument iterator.
pub fn run_from<I, T>(args: I) -> anyhow::Result<ExitCode>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString> + Clone,
{
    cli::dispatch::run_from(args)
}

/// Run N2B from the current process arguments.
pub fn run_from_env() -> anyhow::Result<ExitCode> {
    cli::dispatch::run_from_args()
}

/// Run N2B like the `n2b` binary and return its exit status. Unlike [`run_from`], `--help`, `--version`
/// and argument errors are printed and turned into a status instead of exiting the host process, so
/// embedders (the `@aphrody/bun-plugin-n2b` addon) keep running.
pub fn run_cli<I, T>(args: I) -> i32
where
    I: IntoIterator<Item = T>,
    T: Into<OsString> + Clone,
{
    install_crypto_provider();
    match cli::dispatch::try_run_from(args) {
        Ok(code) if code == ExitCode::SUCCESS => 0,
        Ok(code) if code == ExitCode::from(2) => 2,
        Ok(_) => 1,
        Err(error) => {
            eprintln!("n2b: {error:#}");
            2
        },
    }
}

/// Installs rustls' ring provider for the GitHub and HTTP clients unless the host already installed one.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}
