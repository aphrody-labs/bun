//! `bun lint`, `bun fmt`, `bun n2b`, `bun migrate`, `bun wasm` and `bun build --target=wasm`.
//!
//! The commands live in the embedded `src/js/eval/toolchain.ts`, booted like `bun -e`: oxlint and
//! oxfmt are fetched on first use (pinned, cached by `bun x`) instead of linked, which keeps the
//! binary size unchanged; the Rust to wasm pipeline is `bun:wasm`.

use bun_core::{ZStr, env_var};

use super::check_command::{nearest_package_json, working_directory};
use super::run_command::RunCommand;
use crate::Command;

pub(crate) struct ToolchainCommand;

impl ToolchainCommand {
    #[cold]
    pub(crate) fn exec(ctx: Command::Context) -> crate::Result<()> {
        let script = bun_core::runtime_embed_file!(Codegen, "eval/toolchain.ts").as_bytes();
        ctx.runtime_options.eval.script = script.to_vec().into_boxed_slice();
        RunCommand::exec_eval(ctx)
    }
}

/// Whether `bun <name>` is `bun run <name>`: `scripts.<name>` of the nearest `package.json`, which
/// `bun lint` and the others ran before they were commands. Inside that script (`"lint": "bun lint"`)
/// it is the command.
#[cold]
#[inline(never)]
pub(crate) fn is_package_script(name: &[u8]) -> bool {
    use bun_paths::platform::Auto;
    use bun_paths::resolve_path::join_abs_string;
    if env_var::npm_lifecycle_event::get().is_some_and(|event| event == name) {
        return false;
    }
    let mut cwd = working_directory();
    let mut args = bun_core::argv().into_iter();
    while let Some(arg) = args.next() {
        if arg == name {
            break;
        }
        let given = match arg.strip_prefix(b"--cwd") {
            Some(b"") => args.next(),
            Some(rest) => rest.strip_prefix(b"="),
            None => None,
        };
        if let Some(given) = given {
            cwd = join_abs_string::<Auto>(&cwd, &[given]).to_vec();
        }
    }
    let Some((_, path, contents)) = nearest_package_json(&cwd) else {
        return false;
    };
    let mut quoted = Vec::with_capacity(name.len() + 2);
    quoted.push(b'"');
    quoted.extend_from_slice(name);
    quoted.push(b'"');
    if !bun_core::strings::contains(&contents, &quoted) {
        return false;
    }
    bun_ast::initialize_store();
    let source = bun_ast::Source::init_path_string(&path[..], &contents[..]);
    let (mut log, bump) = (bun_ast::Log::init(), bun_alloc::Arena::new());
    let Ok(json) = bun_parsers::json::parse_package_json_utf8(&source, &mut log, &bump) else {
        return false;
    };
    (json.as_property(b"scripts"))
        .and_then(|scripts| scripts.expr.as_property(name))
        .is_some_and(|script| matches!(script.expr.data, bun_ast::ExprData::EString(_)))
}

/// `bun create aphrody/<template>` composes the Aphrody stack templates instead of cloning a GitHub repository.
pub(crate) fn is_aphrody_create(argv: &[&ZStr]) -> bool {
    argv.iter()
        .skip(2)
        .map(|arg| arg.as_bytes())
        .find(|arg| !arg.starts_with(b"-"))
        .is_some_and(|template| template.starts_with(b"aphrody/"))
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
