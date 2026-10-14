//! Linked justfile runner with explicit Bun Shell support.

use crate::Command;

#[cold]
pub(crate) fn exec(ctx: Command::Context) -> crate::Result<()> {
    let args = super::arguments::command_arguments(&ctx)
        .into_iter()
        .map(|arg| std::str::from_utf8(arg).map(str::to_owned))
        .collect::<Result<Vec<_>, _>>();
    let code = match (args, std::env::current_exe()) {
        (Ok(args), Ok(executable)) => bun_just::run_from(
            std::iter::once("bun just".to_owned()).chain(args),
            executable,
        ),
        (Err(error), _) => {
            bun_core::Output::err_generic("just: {}", (error,));
            2
        }
        (_, Err(error)) => {
            bun_core::Output::err_generic("just: {}", (error,));
            2
        }
    };
    bun_core::Output::flush();
    bun_core::Global::exit(code as u32);
}
