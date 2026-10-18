//! `bun-just <arguments>`: the justfile runner, spawned by `bun just`. Recipes written for Bun Shell run
//! through the bun that spawned the plugin (`BUN_PLUGIN_HOST`).

use std::process::ExitCode;

fn main() -> ExitCode {
    #[allow(clippy::disallowed_methods)]
    let bun = std::env::var_os("BUN_PLUGIN_HOST")
        .filter(|path| !path.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::current_exe().ok());
    let Some(bun) = bun else {
        let _ = std::io::Write::write_all(&mut std::io::stderr(), b"just: no Bun executable\n");
        return ExitCode::from(2);
    };
    let args = std::iter::once("bun just".into()).chain(std::env::args_os().skip(1));
    ExitCode::from(u8::try_from(bun_just::run_from(args, bun).clamp(0, 255)).unwrap_or(1))
}
