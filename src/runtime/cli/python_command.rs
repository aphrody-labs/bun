// SPDX-License-Identifier: MIT
//! Lazy dispatch for Python source files through the separately installed shared host.

use core::ffi::{c_char, c_int};
use std::ffi::{CStr, CString};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use bun_core::{Global, ZStr};
use bun_sys::DynLib;

const ABI_VERSION: u32 = 1;
const HOST_LIBRARY_ENV: &str = "BUN_PYTHON_HOST_LIBRARY";
const LIBPYTHON_ENV: &str = "APHRODY_LIBPYTHON";

type AbiVersion = unsafe extern "C" fn() -> u32;
type LoadPython = unsafe extern "C" fn(*const c_char) -> c_int;
type PythonMain = unsafe extern "C" fn(c_int, *const *const c_char, *mut c_int) -> c_int;
type LastError = unsafe extern "C" fn() -> *mut c_char;
type FreeString = unsafe extern "C" fn(*mut c_char);

struct HostApi {
    _library: DynLib,
    load_python: LoadPython,
    python_main: PythonMain,
    last_error: LastError,
    free_string: FreeString,
}

static HOST: OnceLock<Result<HostApi, String>> = OnceLock::new();

fn host_api() -> Result<&'static HostApi, String> {
    HOST.get_or_init(|| unsafe { load_host() })
        .as_ref()
        .map_err(Clone::clone)
}

unsafe fn load_host() -> Result<HostApi, String> {
    let host_path = std::env::var(HOST_LIBRARY_ENV)
        .map_err(|_| format!("set {HOST_LIBRARY_ENV} to the installed Python host library"))?;
    let library = DynLib::open(host_path.as_bytes())
        .map_err(|error| format!("cannot load Python host {host_path}: {error}"))?;

    // SAFETY: each symbol is checked against the declared host ABI.
    let abi_version: AbiVersion =
        unsafe { lookup(&library, bun_core::zstr!("bun_py_abi_version")) }
            .ok_or_else(|| "Python host is missing bun_py_abi_version".to_owned())?;
    // SAFETY: the symbol uses the declared no-argument C ABI.
    let version = unsafe { abi_version() };
    if version != ABI_VERSION {
        return Err(format!(
            "unsupported Python host ABI {version}; expected {ABI_VERSION}"
        ));
    }

    // SAFETY: the symbols use the signatures from include/bun_python_host.h.
    let load_python: LoadPython =
        unsafe { lookup(&library, bun_core::zstr!("aphrody_py_load")) }
            .ok_or_else(|| "Python host is missing aphrody_py_load".to_owned())?;
    let python_main: PythonMain = unsafe { lookup(&library, bun_core::zstr!("bun_py_main")) }
        .ok_or_else(|| "Python host is missing bun_py_main".to_owned())?;
    let last_error: LastError =
        unsafe { lookup(&library, bun_core::zstr!("aphrody_py_last_error")) }
            .ok_or_else(|| "Python host is missing aphrody_py_last_error".to_owned())?;
    let free_string: FreeString =
        unsafe { lookup(&library, bun_core::zstr!("aphrody_py_string_free")) }
            .ok_or_else(|| "Python host is missing aphrody_py_string_free".to_owned())?;

    Ok(HostApi {
        _library: library,
        load_python,
        python_main,
        last_error,
        free_string,
    })
}

unsafe fn lookup<T>(library: &DynLib, name: &ZStr) -> Option<T> {
    // SAFETY: caller supplies the exact C ABI function-pointer type for each symbol.
    unsafe { library.lookup(name) }
}

fn host_error(api: &HostApi, operation: &str, status: i32) -> String {
    // SAFETY: the host returns a CString allocated by its own ABI.
    let message_ptr = unsafe { (api.last_error)() };
    if message_ptr.is_null() {
        return format!("Python host {operation} failed with status {status}");
    }
    // SAFETY: non-null result is a NUL-terminated string owned by the host.
    let message = unsafe { CStr::from_ptr(message_ptr) }
        .to_string_lossy()
        .into_owned();
    // SAFETY: releases the exact pointer returned by aphrody_py_last_error.
    unsafe { (api.free_string)(message_ptr) };
    format!("Python host {operation} failed with status {status}: {message}")
}

fn path_to_utf8(path: &Path, description: &str) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| format!("{description} path must be valid UTF-8: {}", path.display()))
}

fn python_executable(libpython: &Path) -> Result<String, String> {
    if let Ok(executable) = std::env::var("BUN_PYTHON_EXECUTABLE") {
        return Ok(executable);
    }

    if let Some(venv) = std::env::var_os("VIRTUAL_ENV") {
        let bin_dir = PathBuf::from(venv).join(if cfg!(windows) { "Scripts" } else { "bin" });
        #[cfg(windows)]
        let names = ["python.exe", "python3.exe"];
        #[cfg(not(windows))]
        let names = ["python3", "python"];
        for name in names {
            let executable = bin_dir.join(name);
            if executable.is_file() {
                return path_to_utf8(&executable, "virtual environment Python executable");
            }
        }
    }

    let prefix = std::env::var_os("VU_RUNTIME")
        .map(PathBuf::from)
        .or_else(|| {
            libpython
                .parent()
                .and_then(Path::parent)
                .map(Path::to_path_buf)
        })
        .ok_or_else(|| format!("cannot derive Python prefix from {}", libpython.display()))?;
    #[cfg(windows)]
    let executable = prefix.join("Scripts").join("python.exe");
    #[cfg(not(windows))]
    let executable = prefix.join("bin").join("python3");
    path_to_utf8(&executable, "Python executable")
}

pub(crate) fn is_python_source(path: &[u8]) -> bool {
    path.ends_with(b".py") || path.ends_with(b".pyw")
}

pub(crate) fn is_python_executable(name: &[u8]) -> bool {
    matches!(name, b"python" | b"python3")
}

pub(crate) fn script_arguments<'a>(
    positionals: &'a [Box<[u8]>],
    passthrough: &'a [Box<[u8]>],
) -> Vec<&'a [u8]> {
    positionals
        .iter()
        .chain(passthrough)
        .map(Box::as_ref)
        .collect()
}

/// Runs a Python source target when the separately installed host is configured.
/// Returns false only when the optional host was not configured.
pub(crate) fn run_if_configured(arguments: &[&[u8]]) -> bool {
    if std::env::var_os(HOST_LIBRARY_ENV).is_none() {
        return false;
    }

    if let Err(error) = run(arguments) {
        bun_core::pretty_errorln!("<r><red>error<r>: {error}");
        Global::exit(1);
    }
    unreachable!("Python host exits the process with CPython's result")
}

fn run(arguments: &[&[u8]]) -> Result<(), String> {
    let libpython = std::env::var(LIBPYTHON_ENV)
        .map_err(|_| format!("set {LIBPYTHON_ENV} to the selected runtime's shared library"))?;
    let executable = python_executable(Path::new(&libpython))?;
    let mut argv = Vec::with_capacity(arguments.len() + 1);
    argv.push(CString::new(executable).map_err(|_| "Python executable contains NUL".to_owned())?);
    for argument in arguments {
        let argument = std::str::from_utf8(argument)
            .map_err(|_| "Python CLI arguments must be valid UTF-8".to_owned())?;
        argv.push(CString::new(argument).map_err(|_| "Python argument contains NUL".to_owned())?);
    }
    let pointers: Vec<*const c_char> = argv.iter().map(|argument| argument.as_ptr()).collect();
    let libpython =
        CString::new(libpython).map_err(|_| "libpython path contains NUL".to_owned())?;
    let api = host_api()?;

    // SAFETY: path remains alive for the synchronous call; this explicitly loads the selected
    // libpython and does not initialize CPython.
    let status = unsafe { (api.load_python)(libpython.as_ptr()) };
    if status != 0 {
        return Err(host_error(api, "libpython load", status));
    }

    let mut exit_code = 0;
    // SAFETY: argv is a live array of NUL-terminated UTF-8 strings; the host copies it before
    // entering CPython and writes exit_code only on successful CLI execution.
    let status =
        unsafe { (api.python_main)(pointers.len() as c_int, pointers.as_ptr(), &mut exit_code) };
    if status != 0 {
        return Err(host_error(api, "CLI", status));
    }
    Global::exit(exit_code as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_python_source_suffixes() {
        assert!(is_python_source(b"main.py"));
        assert!(is_python_source(b"main.pyw"));
        assert!(!is_python_source(b"main.pyc"));
        assert!(!is_python_source(b"main.ts"));
        assert!(is_python_executable(b"python"));
        assert!(is_python_executable(b"python3"));
        assert!(!is_python_executable(b"python3.12"));
    }

    #[test]
    fn preserves_script_and_passthrough_argument_order() {
        let positionals = vec![
            b"app.py".to_vec().into_boxed_slice(),
            b"-m".to_vec().into_boxed_slice(),
        ];
        let passthrough = vec![b"--flag".to_vec().into_boxed_slice()];
        assert_eq!(
            script_arguments(&positionals, &passthrough),
            vec![&b"app.py"[..], &b"-m"[..], &b"--flag"[..]]
        );
    }
}
