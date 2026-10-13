//! `bun video`: the lazy embedded CLI over the existing native `Bun.Video` owner.

use super::run_command::RunCommand;
use crate::Command;

#[cold]
pub(crate) fn exec(ctx: Command::Context) -> crate::Result<()> {
    let script = bun_core::runtime_embed_file!(Codegen, "eval/video.ts").as_bytes();
    ctx.runtime_options.eval.script = script.to_vec().into_boxed_slice();
    RunCommand::exec_eval(ctx)
}
