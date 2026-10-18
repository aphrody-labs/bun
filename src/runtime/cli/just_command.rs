//! `bun just`: the justfile runner with explicit Bun Shell support, the `just` plugin.

use crate::Command;

#[cold]
pub(crate) fn exec(ctx: Command::Context) -> crate::Result<()> {
    let args: Vec<std::ffi::OsString> = super::arguments::command_arguments(&ctx)
        .into_iter()
        .map(|arg| String::from_utf8_lossy(arg).into_owned().into())
        .collect();
    super::plugin_command::exec("just", args);
}
