//! `bun n2b`, `bun migrate`, `bun wasm` and `bun build --target=wasm`.
//!
//! Migration commands use their linked Rust owner. Other toolchain commands
//! use embedded `src/js/eval/toolchain.ts`.

use bun_core::{ZStr, env_var};

use super::run_command::RunCommand;
use crate::Command;

pub(crate) struct ToolchainCommand;

impl ToolchainCommand {
    #[cold]
    pub(crate) fn exec(ctx: Command::Context) -> crate::Result<()> {
        if ctx.positionals.first().is_some_and(|arg| &**arg == b"just") {
            return super::just_command::exec(ctx);
        }
        if ctx
            .positionals
            .first()
            .is_some_and(|arg| &**arg == b"video")
        {
            return super::video_command::exec(ctx);
        }
        if let Some(code) = exec_native_n2b(&ctx) {
            bun_core::Output::flush();
            bun_core::Global::exit(code as u32);
        }
        let script = if super::devtools_command::is_devtools_invocation() {
            bun_core::runtime_embed_file!(Codegen, "eval/devtools.ts").as_bytes()
        } else {
            bun_core::runtime_embed_file!(Codegen, "eval/toolchain.ts").as_bytes()
        };
        ctx.runtime_options.eval.script = script.to_vec().into_boxed_slice();
        RunCommand::exec_eval(ctx)
    }
}

const MIGRATE_HELP: &str = "Usage: bun migrate [--dry-run] [path]\n  Migrate a Node.js project to Bun: apply every n2b fix, convert pnpm workspaces, catalogs and\n  overrides to package.json, remove other lockfiles and run bun install.\n\nFlags:\n      --dry-run   Print the migration plan and change nothing\n  -h, --help      Print this help\n\nSame as `bun n2b migrate`. `bun n2b --help` lists every n2b command.\n";

fn exec_native_n2b(ctx: &Command::Context) -> Option<i32> {
    let command = ctx.positionals.first()?;
    if !matches!(&**command, b"n2b" | b"migrate") {
        return None;
    }
    let migrate = &**command == b"migrate";
    let args = super::arguments::command_arguments(ctx)
        .into_iter()
        .map(|arg| std::str::from_utf8(arg).map(str::to_owned))
        .collect::<Result<Vec<_>, _>>();
    Some(match args {
        Ok(mut args) => {
            if migrate && n2b_help_requested(&args) {
                print!("{MIGRATE_HELP}");
                return Some(0);
            }
            args = normalize_n2b_args(args, migrate);
            args.insert(0, "bun n2b".into());
            match std::env::current_exe() {
                Ok(exe) => bun_migrate::run_embedded_cli(args, exe),
                Err(error) => {
                    bun_core::Output::err_generic("n2b: {}", (error,));
                    2
                }
            }
        }
        Err(error) => {
            bun_core::Output::err_generic("n2b: {}", (error,));
            2
        }
    })
}

fn normalize_n2b_args(args: Vec<String>, migrate: bool) -> Vec<String> {
    let mut normalized = Vec::with_capacity(args.len() + 2);
    if migrate {
        normalized.push("--migrate".into());
    }
    let mut literal = false;
    let mut value = false;
    let mut positional = false;
    for arg in args {
        if literal || value {
            normalized.push(arg);
            value = false;
            continue;
        }
        if arg == "--" {
            literal = true;
        } else if !arg.starts_with('-') && !positional {
            positional = true;
            if !migrate && arg == "migrate" {
                normalized.push("--migrate".into());
                continue;
            }
        } else {
            value = n2b_option_takes_value(&arg);
        }
        normalized.push(arg);
    }
    normalized
}

fn n2b_option_takes_value(arg: &str) -> bool {
    matches!(
        arg,
        "--report" | "--ignore" | "--jobs" | "--max-files" | "--max-report-bytes" | "--since"
    )
}

fn n2b_help_requested(args: &[String]) -> bool {
    let mut value = false;
    for arg in args {
        if value {
            value = false;
            continue;
        }
        if arg == "--" {
            break;
        }
        if matches!(arg.as_str(), "--help" | "-h") {
            return true;
        }
        value = n2b_option_takes_value(arg);
    }
    false
}

/// Names handled by the native owners or `eval/toolchain.ts`.
pub(crate) fn is_toolchain_name(arg: &[u8]) -> bool {
    matches!(
        arg,
        b"n2b" | b"migrate" | b"just" | b"wasm" | b"build" | b"create" | b"c"
    )
}

/// Whether the toolchain command names a project package script.
#[cold]
#[inline(never)]
pub(crate) fn is_package_script(name: &[u8]) -> bool {
    if env_var::npm_lifecycle_event::get().is_some_and(|event| event == name) {
        return false;
    }
    matches!(super::script_or_command::runs(name), Ok(super::script_or_command::Runs::Script))
}

/// `bun create aphrody/<template>` composes the Aphrody stack templates instead of cloning a GitHub repository;
/// `bun create aphrody` lists them.
pub(crate) fn is_aphrody_create(argv: &[&ZStr]) -> bool {
    argv.iter()
        .skip(2)
        .map(|arg| arg.as_bytes())
        .find(|arg| !arg.starts_with(b"-"))
        .is_some_and(|template| template == b"aphrody" || template.starts_with(b"aphrody/"))
}

/// `bun build --target=wasm` (or `--target wasm`) builds a Rust crate, not a bundle.
pub(crate) fn is_wasm_build(argv: &[&ZStr]) -> bool {
    let mut args = argv.iter().map(|arg| arg.as_bytes());
    while let Some(arg) = args.next() {
        match arg {
            b"--" => return false,
            b"--target=wasm" => return true,
            b"--target" if args.next() == Some(&b"wasm"[..]) => return true,
            _ => {}
        }
    }
    false
}
