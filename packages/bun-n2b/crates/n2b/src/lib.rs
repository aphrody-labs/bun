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
    silence_closed_stdout_panics();
    let run = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cli::dispatch::try_run_from(args)
    }));
    match run {
        Ok(Ok(code)) if code == ExitCode::SUCCESS => 0,
        Ok(Ok(code)) if code == ExitCode::from(2) => 2,
        Ok(Ok(_)) => 1,
        Ok(Err(error)) => {
            eprintln!("n2b: {error:#}");
            2
        },
        Err(payload) if is_closed_stdout(payload.as_ref()) => 0,
        Err(payload) => std::panic::resume_unwind(payload),
    }
}

// `println!` panics when the reader of stdout goes away (`n2b rules | head`); inside the
// Node-API addon that would take the host process down instead of ending the command.
fn is_closed_stdout(payload: &(dyn std::any::Any + Send)) -> bool {
    let message = payload
        .downcast_ref::<String>()
        .map(String::as_str)
        .or_else(|| payload.downcast_ref::<&str>().copied())
        .unwrap_or_default();
    message.starts_with("failed printing to stdout")
}

fn silence_closed_stdout_panics() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            if !is_closed_stdout(info.payload()) {
                previous(info);
            }
        }));
    });
}

/// Installs rustls' ring provider for the GitHub and HTTP clients unless the host already installed one.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}
