//! `bun winmd` (also the `winmd` argv0): the `winmd` plugin, windows-bindgen with the embedded Windows
//! metadata. Dispatched before the runtime starts.

use super::msvc_command::is_bun_argv0;

#[derive(Clone, Copy)]
pub(crate) enum Invocation {
    Bun,
    Winmd,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        match name {
            b"winmd" => Some(Self::Winmd),
            _ if first_arg == Some(b"winmd") && is_bun_argv0(name) => Some(Self::Bun),
            _ => None,
        }
    }
}

#[cold]
pub(crate) fn exec(invocation: Invocation) -> ! {
    let skip = match invocation {
        Invocation::Bun => 2,
        Invocation::Winmd => 1,
    };
    super::plugin_command::exec("winmd", bun_core::os_args().into_iter().skip(skip));
}
