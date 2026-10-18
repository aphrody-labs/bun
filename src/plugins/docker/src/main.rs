//! `bun-docker <arguments>`: the Docker Engine client, spawned by `bun docker`.

use std::process::ExitCode;

fn main() -> ExitCode {
    let args = std::env::args_os().skip(1).collect();
    ExitCode::from(u8::try_from(bun_docker::cli::main(args).clamp(0, 255)).unwrap_or(1))
}
