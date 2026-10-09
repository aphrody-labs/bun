//! `bun ssh`: the `bun_ssh` crate's command line, dispatched before the runtime starts like
//! `bun msvc`. It drives the system OpenSSH when installed and falls back to the in-process client.

use bun_core::Global;

pub(crate) struct Invocation;

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>, be_bun: impl FnOnce() -> bool) -> Option<Self> {
        if first_arg != Some(b"ssh") {
            return None;
        }
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (super::msvc_command::is_bun_argv0(name) || be_bun()).then_some(Self)
    }
}

#[cold]
pub(crate) fn exec(_: Invocation) -> ! {
    let args = bun_core::os_args().into_iter().skip(2).collect();
    let code = bun_ssh::cli::main(args, "bun ssh");
    Global::exit(code.clamp(0, 255) as u32);
}
