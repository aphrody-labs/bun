use std::ffi::OsString;

use bun_core::Global;
use uv_command_support::ExitStatus;

pub(crate) enum Invocation {
    Bun,
    Uv,
    Uvx,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
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
        Invocation::Bun => (2, &["uv"]),
        Invocation::Uv => (1, &["uv"]),
        Invocation::Uvx => (1, &["uv", "tool", "uvx"]),
    };
    let args = prefix
        .iter()
        .map(OsString::from)
        .chain(std::env::args_os().skip(skip));
    // SAFETY: Command::start dispatches once, before Bun starts worker threads or JSC.
    let status = unsafe { uv::main_status(args) };
    let code = match status {
        ExitStatus::Success => 0,
        ExitStatus::Failure => 1,
        ExitStatus::Error => 2,
        ExitStatus::External(code) => u32::from(code),
    };
    Global::exit(code);
}
