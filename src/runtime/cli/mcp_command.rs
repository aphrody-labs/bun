//! `bun mcp`: the built-in Model Context Protocol server (`bun_mcp`). Dispatched before the
//! runtime starts, like `bun msvc`.

use bun_core::Global;

pub(crate) enum Invocation {
    Bun,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (first_arg == Some(b"mcp") && super::msvc_command::is_bun_argv0(name)).then_some(Self::Bun)
    }
}

#[cold]
pub(crate) fn exec(Invocation::Bun: Invocation) -> ! {
    let args = std::env::args_os().skip(2).collect();
    let code = bun_mcp::main(args, &[]);
    Global::exit(code as u32);
}
