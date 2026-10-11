// SPDX-License-Identifier: Apache-2.0
use crate::{Client, Command, Result, invalid};
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "bun docker",
    about = "Native Docker Engine client; start/stop emit a plan unless --apply"
)]
struct Cli {
    #[arg(long, global = true)]
    host: Option<String>,
    #[command(subcommand)]
    command: Action,
}

#[derive(Subcommand)]
enum Action {
    Version,
    Info,
    Ps {
        #[arg(short, long)]
        all: bool,
    },
    Images,
    Start {
        container: String,
        #[arg(long)]
        apply: bool,
    },
    Stop {
        container: String,
        #[arg(long)]
        apply: bool,
    },
}

fn run(cli: Cli) -> Result<()> {
    if std::env::var_os("DOCKER_TLS_VERIFY").is_some_and(|v| !v.is_empty()) {
        return Err(invalid(
            "Docker TLS is not qualified; use an authenticated SSH host instead",
        ));
    }
    let host = cli
        .host
        .or_else(|| std::env::var("DOCKER_HOST").ok())
        .unwrap_or_else(|| {
            if cfg!(windows) {
                "npipe:////./pipe/docker_engine".into()
            } else {
                "unix:///var/run/docker.sock".into()
            }
        });
    let command = match cli.command {
        Action::Version => Command::Version,
        Action::Info => Command::Info,
        Action::Ps { all } => Command::Ps { all },
        Action::Images => Command::Images,
        Action::Start { container, apply } => Command::Start { container, apply },
        Action::Stop { container, apply } => Command::Stop { container, apply },
    };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let value = runtime.block_on(Client::new(&host)?.execute(&command))?;
    println!("{}", serde_json::to_string_pretty(&value)?);
    Ok(())
}

pub fn main(args: Vec<std::ffi::OsString>) -> i32 {
    let cli = match Cli::try_parse_from(
        std::iter::once(std::ffi::OsString::from("bun docker")).chain(args),
    ) {
        Ok(cli) => cli,
        Err(error) => {
            let code = error.exit_code();
            let _ = error.print();
            return code;
        }
    };
    match run(cli) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("bun docker: {error}");
            1
        }
    }
}
