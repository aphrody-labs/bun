//! `bun-uv <uv arguments>`: the uv command line, spawned by `bun uv`, `uvx` and `bun build --compile` of Python.

use std::ffi::OsString;
use std::process::ExitCode;

use uv_command_support::ExitStatus;

fn main() -> ExitCode {
    let args = std::iter::once(OsString::from("uv")).chain(std::env::args_os().skip(1));
    // SAFETY: first thing in `main`, before any thread exists; called once.
    let status = unsafe { uv::main_status(args) };
    match status {
        ExitStatus::Success => ExitCode::SUCCESS,
        ExitStatus::Failure => ExitCode::from(1),
        ExitStatus::Error => ExitCode::from(2),
        ExitStatus::External(code) => ExitCode::from(code),
    }
}
