//! `bun msvc`: resolve, set up and cache the native Windows toolchain (every Visual Studio /
//! Build Tools instance, MSVC toolset, Windows SDK, UCRT, .NET Framework SDK, LLVM, the developer
//! scripts and the vcvarsall environment) without vswhere.exe or any `.bat`. Dispatched before the
//! runtime starts, like `bun uv`. The command line itself is `find_msvc_tools::cli`, shared with
//! the crate's `bun-msvc` binary that `scripts/build.ts` falls back to.

use bun_core::Global;

pub(crate) enum Invocation {
    Bun,
    Msvc,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        match name {
            b"msvc" => Some(Self::Msvc),
            _ if first_arg == Some(b"msvc") && is_bun_argv0(name) => Some(Self::Bun),
            _ => None,
        }
    }
}

/// `argv0` basename (without `.exe`) of a bun binary, so `bun <subcommand>` dispatches early.
pub(crate) fn is_bun_argv0(name: &[u8]) -> bool {
    matches!(
        name,
        b"bun"
            | b"bun-debug"
            | b"bun-profile"
            | b"bun-asan"
            | b"bun-valgrind"
            | b"bun-asan-valgrind"
            | b"bun-assertions"
    )
}

pub(crate) fn fail(message: core::fmt::Arguments<'_>) -> ! {
    use std::io::Write;
    let _ = writeln!(std::io::stderr().lock(), "error: {message}");
    Global::exit(1);
}

pub(crate) fn out(bytes: &[u8]) {
    use std::io::Write;
    let mut stdout = std::io::stdout().lock();
    let _ = stdout.write_all(bytes);
    let _ = stdout.flush();
}

#[cold]
pub(crate) fn exec(invocation: Invocation) -> ! {
    let (skip, self_args): (usize, &[&str]) = match invocation {
        Invocation::Bun => (2, &["msvc"]),
        Invocation::Msvc => (1, &[]),
    };
    #[cfg(windows)]
    {
        let code = find_msvc_tools::cli::main(std::env::args_os().skip(skip).collect(), self_args);
        Global::exit(code as u32);
    }
    #[cfg(not(windows))]
    {
        let _ = (skip, self_args);
        fail(format_args!("bun msvc is only available on Windows"));
    }
}
