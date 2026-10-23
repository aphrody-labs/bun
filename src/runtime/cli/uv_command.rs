use std::ffi::OsString;

#[derive(Clone, Copy)]
pub(crate) enum Invocation {
    Bun,
    Uv,
    Uvx,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        // Windows ignores case in file names and PATHEXT spells the extension its own way: `UV.EXE`
        // and `uv.EXE` are `uv`.
        let name = name.to_ascii_lowercase();
        let name = name.strip_suffix(b".exe").unwrap_or(&name);
        match name {
            b"uv" => Some(Self::Uv),
            b"uvx" => Some(Self::Uvx),
            b"bun" | b"buv" | b"pyjs" | b"bun-debug" | b"bun-profile" | b"bun-asan"
            | b"bun-valgrind" | b"bun-asan-valgrind" | b"bun-assertions"
                if first_arg == Some(b"uv") =>
            {
                Some(Self::Bun)
            }
            _ => None,
        }
    }
}

#[cold]
pub(crate) fn exec(invocation: Invocation) -> ! {
    let (skip, prefix): (usize, &[&str]) = match invocation {
        Invocation::Bun => (2, &[]),
        Invocation::Uv => (1, &[]),
        Invocation::Uvx => (1, &["tool", "uvx"]),
    };
    let args = prefix
        .iter()
        .map(OsString::from)
        .chain(bun_core::os_args().into_iter().skip(skip));
    super::plugin_command::exec("uv", args);
}
