//! `bun-vpn <vpn arguments>`: the Mullvad client and daemon, spawned by `bun vpn`.

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args_os()
        .skip(1)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    ExitCode::from(u8::try_from(bun_vpn::cli(&args).clamp(0, 255)).unwrap_or(1))
}
