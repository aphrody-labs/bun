//! `bun dotnet …`, the `dotnet` argv0 alias and `bun run app.cs`: the .NET muxer runs inside
//! this process through `hostfxr_main_startupinfo` (packages/bun-dotnet-native), with the SDK
//! of the install `bun-dotnet-host` locates (nethost order, `DOTNET_ROOT`, `PATH`).

use std::ffi::OsString;

use bun_core::Global;

pub(crate) enum Invocation {
    Bun,
    Dotnet,
}

impl Invocation {
    #[inline]
    pub(crate) fn from_argv(argv0: &[u8], first_arg: Option<&[u8]>) -> Option<Self> {
        let name = bun_paths::resolve_path::basename(argv0);
        let name = name.strip_suffix(b".exe").unwrap_or(name);
        match name {
            b"dotnet" => Some(Self::Dotnet),
            b"bun" | b"csjs" | b"bun-debug" | b"bun-profile" | b"bun-asan" | b"bun-valgrind"
            | b"bun-asan-valgrind" | b"bun-assertions"
                if first_arg == Some(b"dotnet") =>
            {
                Some(Self::Bun)
            }
            _ => None,
        }
    }
}

#[cold]
pub(crate) fn exec(invocation: Invocation) -> ! {
    let skip = match invocation {
        Invocation::Bun => 2,
        Invocation::Dotnet => 1,
    };
    if matches!(invocation, Invocation::Bun)
        && let Some(command) = std::env::args().nth(2)
        && crate::dotnet::tools::COMMANDS.contains(&command.as_str())
    {
        let args: Vec<String> = std::env::args().skip(3).collect();
        Global::exit(crate::dotnet::tools::run(&command, &args) as u32);
    }
    muxer(std::env::args_os().skip(skip))
}

/// `.cs` source: a .NET 10 file-based app (`#:package`, `#:sdk`, `#:property`).
pub(crate) fn is_csharp_source(path: &[u8]) -> bool {
    path.len() > 3 && path[path.len() - 3..].eq_ignore_ascii_case(b".cs")
}

/// `dotnet run --file <path> -- <args>`: builds (cached by the SDK) and runs the file-based app.
#[cold]
pub(crate) fn run_file(path: &[u8], args: &[&[u8]]) -> ! {
    let os = |bytes: &[u8]| OsString::from(String::from_utf8_lossy(bytes).into_owned());
    let argv = [
        OsString::from("run"),
        OsString::from("--file"),
        os(path),
        OsString::from("--"),
    ]
    .into_iter()
    .chain(args.iter().map(|arg| os(arg)));
    muxer(argv)
}

fn muxer(args: impl IntoIterator<Item = OsString>) -> ! {
    let args: Vec<OsString> = args.into_iter().collect();
    let result = bun_dotnet_host::hostfxr().and_then(|fxr| fxr.main(&args));
    match result {
        Ok(code) => Global::exit(code as u32),
        Err(err) => {
            bun_core::pretty_errorln!("<r><red>error<r>: bun dotnet: {}", err.message);
            if err.code.is_none() {
                bun_core::pretty_errorln!("<d>Install .NET with <b>bun dotnet setup<r><d>, or set DOTNET_ROOT.<r>");
            }
            Global::exit(1);
        }
    }
}
