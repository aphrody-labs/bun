//! `bun msvc`: the native Windows toolchain (Visual Studio / Build Tools, MSVC, Windows SDK, UCRT)
//! discovered in-process — Setup Configuration COM, no vswhere.exe, no vcvarsall.bat. Dispatched
//! before the runtime starts, like `bun uv`. The discovery lives in `windows::sys::toolchain`, shared
//! with `toolchain()` of `bun:windows`.
//!
//! ```text
//! bun msvc [doctor]                        checks, exit 1 when cl/link/SDK are missing
//! bun msvc info [--arch a]                 everything as JSON
//! bun msvc env [--arch a] [--format f]     vcvars environment: json (default), pwsh, cmd, sh, github
//! bun msvc which <tool> [--arch a]         cl, link, lib, dumpbin, rc, midl, mt, ...
//! bun msvc exec [--arch a] [--] <tool> [args...]
//! ```

use std::ffi::OsString;

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

struct Args {
    command: String,
    arch: Option<String>,
    format: Option<String>,
    rest: Vec<OsString>,
}

fn parse(args: Vec<OsString>) -> Args {
    let mut parsed = Args {
        command: String::new(),
        arch: None,
        format: None,
        rest: Vec::new(),
    };
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        // After the command, `exec` and `which` take the first positional and everything after it.
        if !parsed.command.is_empty() && !parsed.rest.is_empty() {
            parsed.rest.push(arg);
            continue;
        }
        let text = arg.to_string_lossy().into_owned();
        let value = |iter: &mut std::vec::IntoIter<OsString>, name: &str| -> String {
            match iter.next() {
                Some(v) => v.to_string_lossy().into_owned(),
                None => fail(format_args!("{name} needs a value")),
            }
        };
        match text.as_str() {
            "--" => {
                parsed.rest.extend(iter.by_ref());
                break;
            }
            "--arch" => parsed.arch = Some(value(&mut iter, "--arch")),
            "--format" => parsed.format = Some(value(&mut iter, "--format")),
            "--json" => parsed.format = Some("json".into()),
            "-h" | "--help" => parsed.command = "help".into(),
            _ => {
                if let Some(arch) = text.strip_prefix("--arch=") {
                    parsed.arch = Some(arch.into());
                } else if let Some(format) = text.strip_prefix("--format=") {
                    parsed.format = Some(format.into());
                } else if parsed.command.is_empty() {
                    parsed.command = text;
                } else {
                    parsed.rest.push(arg);
                }
            }
        }
    }
    parsed
}

const HELP: &str = "\
Usage: bun msvc <command> [--arch x64|x86|arm64|arm64ec]

The Windows native toolchain (Visual Studio / Build Tools, MSVC, Windows SDK, UCRT), discovered
in-process through the Setup Configuration COM API.

Commands:
  doctor                      Check the toolchain (default); exit code 1 if cl, link or the SDK is missing
  info                        Print everything as JSON (instances, msvc, sdk, ucrt, tools, env, paths)
  env [--format <f>]          Print the vcvarsall environment: json (default), pwsh, cmd, sh, github
  which <tool>                Print the path of cl, link, lib, dumpbin, editbin, nmake, rc, midl, mt, ...
  exec [--] <tool> [args...]  Run a tool with the computed environment

Options:
  --arch <arch>               Target architecture (default: host)
";

#[cold]
pub(crate) fn exec(invocation: Invocation) -> ! {
    let skip = match invocation {
        Invocation::Bun => 2,
        Invocation::Msvc => 1,
    };
    let args = parse(std::env::args_os().skip(skip).collect());
    if args.command == "help" {
        out(HELP.as_bytes());
        Global::exit(0);
    }
    #[cfg(windows)]
    windows::run(args);
    #[cfg(not(windows))]
    {
        let _ = args;
        fail(format_args!("bun msvc is only available on Windows"));
    }
}

#[cfg(windows)]
mod windows {
    use std::ffi::OsString;
    use std::path::Path;

    use bun_core::Global;
    use find_msvc_tools::toolchain::Toolchain;

    use super::{fail, out, Args, HELP};
    use crate::windows::sys::toolchain as discovery;
    use crate::windows::sys::Json;

    pub(super) fn run(args: Args) -> ! {
        let arch = match &args.arch {
            Some(arch) => discovery::normalize_arch(arch)
                .unwrap_or_else(|| fail(format_args!("unknown architecture: {arch}"))),
            None => discovery::host_arch(),
        };
        match args.command.as_str() {
            "" | "doctor" => doctor(arch),
            "info" => {
                let mut json = discovery::to_json(arch);
                json.push('\n');
                out(json.as_bytes());
                Global::exit(0);
            }
            "env" => env(&require(arch), args.format.as_deref().unwrap_or("json")),
            "which" => {
                let Some(tool) = args.rest.first() else {
                    fail(format_args!("usage: bun msvc which <tool>"));
                };
                let tool = tool.to_string_lossy();
                match require(arch).which(&tool) {
                    Some(path) => {
                        out(format!("{}\n", path.display()).as_bytes());
                        Global::exit(0);
                    }
                    None => fail(format_args!("{tool} was not found in the {arch} toolchain")),
                }
            }
            "exec" => exec(&require(arch), args.rest),
            other => {
                out(HELP.as_bytes());
                fail(format_args!("unknown command: {other}"));
            }
        }
    }

    fn require(arch: &'static str) -> Toolchain {
        discovery::find(arch).unwrap_or_else(|| {
            fail(format_args!(
                "no Visual Studio or Build Tools instance with the MSVC {arch} toolset was found \
                 (install the \"Desktop development with C++\" workload)"
            ))
        })
    }

    fn doctor(arch: &'static str) -> ! {
        let toolchain = discovery::find(arch);
        let mut report = format!("bun msvc doctor: target {arch}, host {}\n", discovery::host_arch());
        let mut ok = true;
        let mut line = |ok_: bool, label: &str, detail: String| {
            report.push_str(&format!(
                "  {} {label:<14} {detail}\n",
                if ok_ { "ok     " } else { "missing" }
            ));
        };
        match &toolchain {
            Some(t) => {
                line(
                    true,
                    "Visual Studio",
                    format!("{} {} ({})", t.instance.product(), t.instance.version, t.instance.path.display()),
                );
                line(true, "MSVC", format!("{} ({})", t.vc_tools_version, t.vc_bin.display()));
                for tool in ["cl", "link", "lib", "rc", "mt", "midl"] {
                    let found = t.which(tool);
                    let required = matches!(tool, "cl" | "link" | "lib");
                    ok &= found.is_some() || !required;
                    line(
                        found.is_some(),
                        &format!("{tool}.exe"),
                        found.map_or_else(String::new, |p| p.display().to_string()),
                    );
                }
                match &t.sdk {
                    Some(sdk) => {
                        line(true, "Windows SDK", format!("{} ({})", sdk.version, sdk.dir.display()));
                        let winmd = sdk
                            .union_metadata
                            .as_ref()
                            .map(|dir| dir.join("Windows.winmd"))
                            .filter(|p| p.is_file());
                        line(
                            winmd.is_some(),
                            "Windows.winmd",
                            winmd.map_or_else(String::new, |p| p.display().to_string()),
                        );
                    }
                    None => {
                        ok = false;
                        line(false, "Windows SDK", String::new());
                    }
                }
                match &t.ucrt {
                    Some(ucrt) => line(true, "UCRT", format!("{} ({})", ucrt.version, ucrt.dir.display())),
                    None => {
                        ok = false;
                        line(false, "UCRT", String::new());
                    }
                }
            }
            None => {
                ok = false;
                line(false, "MSVC", format!("no instance with the {arch} toolset"));
            }
        }
        out(report.as_bytes());
        Global::exit(if ok { 0 } else { 1 });
    }

    fn single_quoted(value: &str, quote_escape: &str) -> String {
        let mut s = String::with_capacity(value.len() + 2);
        s.push('\'');
        for ch in value.chars() {
            if ch == '\'' {
                s.push_str(quote_escape);
            } else {
                s.push(ch);
            }
        }
        s.push('\'');
        s
    }

    /// `C:\a\b` → `/c/a/b` (MSYS2 / Git Bash), for `PATH` in `--format sh`.
    fn msys_path(path: &str) -> String {
        let bytes = path.as_bytes();
        let mut s = String::with_capacity(path.len() + 1);
        let rest = if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
            s.push('/');
            s.push(bytes[0].to_ascii_lowercase() as char);
            &path[2..]
        } else {
            path
        };
        for ch in rest.chars() {
            s.push(if ch == '\\' { '/' } else { ch });
        }
        s
    }

    fn env(toolchain: &Toolchain, format: &str) -> ! {
        let vars = toolchain.env();
        let mut text = String::new();
        match format {
            "json" => {
                let mut json = Json::new();
                json.begin_object();
                for (name, value) in &vars {
                    json.field_str(name, &value.to_string_lossy());
                }
                json.end_object();
                text = json.finish();
                text.push('\n');
            }
            "pwsh" | "powershell" => {
                for (name, value) in &vars {
                    text.push_str(&format!("$env:{name} = {}\n", single_quoted(&value.to_string_lossy(), "''")));
                }
            }
            "cmd" | "bat" => {
                for (name, value) in &vars {
                    text.push_str(&format!("set \"{name}={}\"\n", value.to_string_lossy()));
                }
            }
            "sh" | "bash" => {
                for (name, value) in &vars {
                    let value = value.to_string_lossy();
                    let value = if *name == "PATH" {
                        std::env::split_paths(value.as_ref())
                            .map(|p| msys_path(&p.to_string_lossy()))
                            .collect::<Vec<_>>()
                            .join(":")
                    } else {
                        value.into_owned()
                    };
                    text.push_str(&format!("export {name}={}\n", single_quoted(&value, "'\\''")));
                }
            }
            "github" => {
                for (name, value) in &vars {
                    text.push_str(&format!("{name}={}\n", value.to_string_lossy()));
                }
            }
            other => fail(format_args!("unknown format: {other} (json, pwsh, cmd, sh, github)")),
        }
        out(text.as_bytes());
        Global::exit(0);
    }

    fn exec(toolchain: &Toolchain, rest: Vec<OsString>) -> ! {
        let mut rest = rest.into_iter();
        let Some(tool) = rest.next() else {
            fail(format_args!("usage: bun msvc exec [--] <tool> [args...]"));
        };
        let program = {
            let name = tool.to_string_lossy();
            let bare = !name.contains(['\\', '/']);
            match bare.then(|| toolchain.which(&name)).flatten() {
                Some(path) => path.into_os_string(),
                None => tool.clone(),
            }
        };
        // Off-loop one-shot spawn before the runtime starts; `bun_core::util::spawn_sync_inherit`
        // is this same `std::process::Command` on Windows but cannot pass an environment.
        #[allow(clippy::disallowed_types, clippy::disallowed_methods)]
        let status = std::process::Command::new(&program)
            .args(rest)
            .envs(toolchain.env())
            .status();
        match status {
            Ok(status) => Global::exit(status.code().unwrap_or(1) as u32),
            Err(err) => fail(format_args!("{}: {err}", Path::new(&program).display())),
        }
    }
}
