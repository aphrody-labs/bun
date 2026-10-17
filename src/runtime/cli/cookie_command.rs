//! `bun cookie`: cookie jars on disk (`bun_env_cookie`). Dispatched before the runtime starts,
//! like `bun host`.

use bun_core::Global;

use super::msvc_command::{is_bun_argv0, out};

pub(crate) struct Invocation;

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        (first_arg == Some(b"cookie") && is_bun_argv0(name)).then_some(Self)
    }
}

#[cold]
pub(crate) fn exec(_: Invocation) -> ! {
    use std::io::Write;
    let args: Vec<String> = bun_core::os_args()
        .into_iter()
        .skip(2)
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let mut io = bun_env_cookie::Io::default();
    let code = bun_env_cookie::cookie_main(&args, &mut io);
    out(io.out.as_bytes());
    let _ = bun_sys::FileWriter(bun_sys::Fd::stderr()).write_all(io.err.as_bytes());
    Global::exit(u32::try_from(code).unwrap_or(1));
}
