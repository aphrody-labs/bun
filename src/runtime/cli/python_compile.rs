// SPDX-License-Identifier: MIT
//! Lazy Python compilation through the selected CPython host and embedded UV.

use std::ffi::OsString;

use bun_core::{Global, ZStr};
use uv_command_support::ExitStatus;

const SOURCE: &str = include_str!("../../../packages/buv/crates/buv-runtime/py/compile.py");
const HELP: &str = "Usage: buv compile <entry.py> [--format exe|shared|wasm] [--outfile <path>]\n\
    --backend cython|nuitka   Isolated native compiler (default: Cython)\n\
    --module-name <name>      CPython extension's import name and PyInit_* ABI\n\
    --onefile                Nuitka standalone executable in one file\n\
    --target native|wasm     Cross-platform products require a qualified host\n\
    --db <bun_python.sqlite> Record native compilation receipts\n\
    --bytecode|--zipapp      Explicit bytecode or executable-archive products\n\
    --offline                Resolve compiler packages from the UV cache\n\
    --force                  Replace an existing build product\n\
Cython executables require CPython and its standard library. Shared libraries\n\
export the Python PyInit_* ABI. WASM requires a real CPython WASI toolchain.\n";

fn option<'a>(args: &'a [&[u8]], name: &[u8]) -> Option<&'a [u8]> {
    args.iter().enumerate().find_map(|(index, argument)| {
        if *argument == name {
            args.get(index + 1).copied()
        } else {
            argument
                .strip_prefix(name)
                .and_then(|remaining| remaining.strip_prefix(b"="))
        }
    })
}

pub(crate) fn is_python_build(args: &[&ZStr]) -> bool {
    let mut expects_value = false;
    args.iter().skip(2).any(|argument| {
        let argument = argument.as_bytes();
        if expects_value {
            expects_value = false;
            return false;
        }
        expects_value = matches!(
            argument,
            b"--outfile"
                | b"--out"
                | b"-o"
                | b"--root"
                | b"--target"
                | b"--backend"
                | b"--module-name"
                | b"--format"
                | b"--compiler"
                | b"--db"
                | b"--receipt"
                | b"--wasm-builder"
                | b"--cpython-root"
                | b"--host"
                | b"--image"
                | b"--cache"
                | b"--jobs"
                | b"--abi"
        );
        !argument.starts_with(b"-")
            && (super::python_command::is_python_source(argument) || argument.ends_with(b".pyx"))
    })
}

#[inline]
pub(crate) fn is_compile_command(argv0: &[u8], first_arg: Option<&[u8]>) -> bool {
    if first_arg != Some(b"compile") {
        return false;
    }
    let name = bun_paths::basename(argv0);
    let name = name.strip_suffix(b".exe").unwrap_or(name);
    matches!(
        name,
        b"bun"
            | b"buv"
            | b"pyjs"
            | b"bun-debug"
            | b"bun-profile"
            | b"bun-asan"
            | b"bun-valgrind"
            | b"bun-asan-valgrind"
            | b"bun-assertions"
    ) || bun_core::env_var::feature_flag::BUN_BE_BUN::get().unwrap_or(false)
}

#[cold]
#[inline(never)]
pub(crate) fn exec(args: &[&ZStr]) -> ! {
    if let Err(error) = compile(args) {
        bun_core::pretty_errorln!("<r><red>error<r>: {}", error);
        Global::exit(1);
    }
    unreachable!("Python compilation exits with its compiler result")
}

fn compile(argv: &[&ZStr]) -> Result<(), String> {
    let arguments: Vec<&[u8]> = argv
        .iter()
        .skip(2)
        .map(|argument| argument.as_bytes())
        .collect();
    if arguments
        .iter()
        .any(|argument| matches!(*argument, b"--help" | b"-h"))
    {
        bun_core::Output::print_bytes(HELP.as_bytes());
        bun_core::Output::flush();
        Global::exit(0);
    }
    let executable = bun_core::util::self_exe_path()
        .map_err(|error| format!("cannot locate the native compiler executable: {error}"))?;
    let executable = std::str::from_utf8(executable.as_bytes())
        .map_err(|_| "compiler executable must be a UTF-8 path".to_owned())?;
    let mut host_arguments = vec![b"-c".as_slice(), SOURCE.as_bytes()];
    host_arguments.extend(arguments.iter().copied());
    host_arguments.extend([b"--buv-executable".as_slice(), executable.as_bytes()]);
    let direct = arguments
        .iter()
        .any(|argument| matches!(*argument, b"--bytecode" | b"--zipapp" | b"--backend-ready"))
        || matches!(option(&arguments, b"--format"), Some(b"wasm"))
        || matches!(
            option(&arguments, b"--target"),
            Some(b"wasm" | b"wasm32-wasip1")
        );
    if direct {
        if !super::python_command::run_if_configured(&host_arguments) {
            return Err(
                "Python compilation requires BUN_PYTHON_HOST_LIBRARY and BUN_PYTHON_LIBPYTHON"
                    .to_owned(),
            );
        }
        unreachable!("configured CPython host exits")
    }
    let backend = option(&arguments, b"--backend").unwrap_or(b"cython");
    let requirements: &[&str] = match backend {
        b"cython" => &["Cython==3.3.0", "setuptools==84.0.0"],
        b"nuitka" => &["Nuitka==4.2.2"],
        _ => return Err("--backend must be cython or nuitka".to_owned()),
    };
    if bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_HOST_LIBRARY")).is_none()
        || bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_LIBPYTHON")).is_none()
    {
        return Err(
            "native compilation requires the selected CPython host and libpython".to_owned(),
        );
    }
    let python = bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_EXECUTABLE")).ok_or_else(|| {
        "set BUN_PYTHON_EXECUTABLE to the qualified compiler interpreter".to_owned()
    })?;
    let python = std::str::from_utf8(python)
        .map_err(|_| "BUN_PYTHON_EXECUTABLE must be a UTF-8 path".to_owned())?;
    let mut uv_arguments: Vec<OsString> = [
        "uv",
        "run",
        "--isolated",
        "--no-project",
        "--no-config",
        "--no-env-file",
        "--no-python-downloads",
        "--python",
        python,
    ]
    .into_iter()
    .map(OsString::from)
    .collect();
    if arguments.contains(&b"--offline".as_slice()) {
        uv_arguments.push(OsString::from("--offline"));
    }
    for requirement in requirements {
        uv_arguments.extend([OsString::from("--with"), OsString::from(*requirement)]);
    }
    uv_arguments.extend([
        OsString::from("--"),
        OsString::from(executable),
        OsString::from("python"),
    ]);
    for argument in host_arguments {
        uv_arguments
            .push(OsString::from(std::str::from_utf8(argument).map_err(
                |_| "Python compiler arguments must be UTF-8".to_owned(),
            )?));
    }
    uv_arguments.push(OsString::from("--backend-ready"));
    // SAFETY: compilation dispatch runs before JSC or worker threads are initialized.
    let status = unsafe { uv::main_status(uv_arguments) };
    Global::exit(match status {
        ExitStatus::Success => 0,
        ExitStatus::Failure => 1,
        ExitStatus::Error => 2,
        ExitStatus::External(code) => u32::from(code),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_option_values_without_renaming_outputs() {
        assert_eq!(
            option(&[b"main.py", b"--format=shared"], b"--format"),
            Some(b"shared".as_slice())
        );
        assert_eq!(
            option(&[b"--outfile", b"library.so"], b"--outfile"),
            Some(b"library.so".as_slice())
        );
        assert_eq!(option(&[b"--formatting=exe"], b"--format"), None);
        assert_eq!(option(&[b"--format"], b"--format"), None);
    }
}
