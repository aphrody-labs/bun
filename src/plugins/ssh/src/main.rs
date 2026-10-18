//! `bun-ssh ssh <arguments>` runs `bun ssh`; `bun-ssh rsync <arguments>` runs `bun rsync --native`.

use std::ffi::OsString;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = std::env::args_os().skip(1);
    let command = args.next();
    let (prefix, program): (&[&str], &str) = match command.as_ref().and_then(|c| c.to_str()) {
        Some("ssh") => (&[], "bun ssh"),
        Some("rsync") => (&["cp", "--delta"], "bun rsync --native"),
        _ => {
            let _ = std::io::Write::write_all(
                &mut std::io::stderr(),
                b"usage: bun-ssh <ssh|rsync> [arguments]\n",
            );
            return ExitCode::from(2);
        }
    };
    let args: Vec<OsString> = prefix.iter().map(OsString::from).chain(args).collect();
    ExitCode::from(u8::try_from(bun_ssh::cli::main(args, program).clamp(0, 255)).unwrap_or(1))
}
