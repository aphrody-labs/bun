//! `bun host`: resource inventory and shared host registry (`bun_host`). Dispatched before the
//! runtime starts, like `bun msvc`.

use bun_core::Global;

use super::msvc_command::{is_bun_argv0, out};

pub(crate) enum Invocation {
    Bun,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (first_arg == Some(b"host") && is_bun_argv0(name)).then_some(Self::Bun)
    }
}

#[cold]
pub(crate) fn exec(Invocation::Bun: Invocation) -> ! {
    use std::io::Write;
    let args = std::env::args_os().skip(2).collect();
    let mut io = bun_host::cli::Io::default();
    let code = bun_host::cli::main(args, &mut io);
    out(io.out.as_bytes());
    let _ = bun_sys::FileWriter(bun_sys::Fd::stderr()).write_all(io.err.as_bytes());
    Global::exit(code as u32);
}
