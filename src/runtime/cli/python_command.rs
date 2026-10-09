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
const LIBPYTHON_ENV: &str = "BUN_PYTHON_LIBPYTHON";

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
    let host_path = bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_HOST_LIBRARY"))
        .ok_or_else(|| format!("set {HOST_LIBRARY_ENV} to the installed Python host library"))?;
    let host_path = std::str::from_utf8(host_path)
        .map_err(|_| format!("{HOST_LIBRARY_ENV} must be a UTF-8 path"))?;
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
    library.lookup(name)
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

fn is_executable(path: &Path, description: &str) -> Result<String, String> {
    let path = path_to_utf8(path, description)?;
    let c_path =
        CString::new(path.as_bytes()).map_err(|_| format!("{description} contains NUL"))?;
    let z_path = ZStr::from_slice_with_nul(c_path.as_bytes_with_nul());
    #[cfg(unix)]
    let executable = bun_sys::is_executable_file_path(z_path);
    #[cfg(windows)]
    let executable = {
        let is_exe = Path::new(&path)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"));
        is_exe && bun_sys::exists_z(z_path)
    };
    #[cfg(not(any(unix, windows)))]
    let executable = bun_sys::exists_z(z_path);
    if !executable {
        return Err(format!("{description} is not an executable file: {path}"));
    }
    Ok(path)
}

fn python_executable(libpython: &Path) -> Result<String, String> {
    #[cfg(not(unix))]
    let _ = libpython;

    if let Some(executable) = bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_EXECUTABLE")) {
        let executable = std::str::from_utf8(executable)
            .map_err(|_| "BUN_PYTHON_EXECUTABLE must be a UTF-8 path".to_owned())?;
        return is_executable(Path::new(executable), "BUN_PYTHON_EXECUTABLE");
    }

    if let Some(venv) = bun_core::getenv_z(bun_core::zstr!("VIRTUAL_ENV")) {
        let venv =
            std::str::from_utf8(venv).map_err(|_| "VIRTUAL_ENV must be a UTF-8 path".to_owned())?;
        let bin_dir = PathBuf::from(venv).join(if cfg!(windows) { "Scripts" } else { "bin" });
        #[cfg(windows)]
        let names = ["python.exe"];
        #[cfg(not(windows))]
        let names = ["python", "python3"];
        for name in names {
            let executable = bin_dir.join(name);
            if let Ok(executable) =
                is_executable(&executable, "virtual environment Python executable")
            {
                return Ok(executable);
            }
        }
        return Err(format!(
            "VIRTUAL_ENV has no executable Python entry point: {venv}"
        ));
    }

    let prefix = if let Some(prefix) = bun_core::getenv_z(bun_core::zstr!("VU_RUNTIME")) {
        let prefix = std::str::from_utf8(prefix)
            .map_err(|_| "VU_RUNTIME must be a UTF-8 path".to_owned())?;
        PathBuf::from(prefix)
    } else {
        #[cfg(unix)]
        {
            derive_unix_prefix(libpython).ok_or_else(|| {
                format!(
                    "cannot derive Python prefix from unqualified libpython path {}",
                    libpython.display()
                )
            })?
        }
        #[cfg(not(unix))]
        {
            return Err("set VU_RUNTIME or BUN_PYTHON_EXECUTABLE to select CPython".to_owned());
        }
    };
    #[cfg(windows)]
    let executable = prefix.join("python.exe");
    #[cfg(not(windows))]
    let executable = prefix.join("bin").join("python3");
    is_executable(&executable, "runtime Python executable")
}

#[cfg(unix)]
fn derive_unix_prefix(libpython: &Path) -> Option<PathBuf> {
    let filename = libpython.file_name()?.to_str()?;
    let is_libpython = filename.starts_with("libpython")
        && (filename.ends_with(".so")
            || bun_core::strings::contains(filename.as_bytes(), b".so.")
            || filename.ends_with(".dylib")
            || bun_core::strings::contains(filename.as_bytes(), b".dylib."));
    let libdir = libpython.parent()?;
    let libdir_name = libdir.file_name()?.to_str()?;
    if !is_libpython || !matches!(libdir_name, "lib" | "lib64") {
        return None;
    }
    libdir.parent().map(Path::to_path_buf)
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
    if bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_HOST_LIBRARY")).is_none() {
        return false;
    }

    if let Err(error) = run(arguments) {
        bun_core::pretty_errorln!("<r><red>error<r>: {}", error);
        Global::exit(1);
    }
    unreachable!("Python host exits the process with CPython's result")
}

fn run(arguments: &[&[u8]]) -> Result<(), String> {
    let libpython = bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_LIBPYTHON"))
        .ok_or_else(|| format!("set {LIBPYTHON_ENV} to the selected runtime's shared library"))?;
    let libpython = std::str::from_utf8(libpython)
        .map_err(|_| format!("{LIBPYTHON_ENV} must be a UTF-8 path"))?;
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
    // entering CPython. A SystemExit may terminate the process inside the host before this call
    // returns, so the out parameter is consumed only when control returns successfully here.
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

    #[cfg(unix)]
    #[test]
    fn derives_prefix_only_from_a_libpython_in_lib_directory() {
        assert_eq!(
            derive_unix_prefix(Path::new("/opt/vu/lib/libpython3.12.so.1.0")),
            Some(PathBuf::from("/opt/vu"))
        );
        assert_eq!(
            derive_unix_prefix(Path::new("/opt/vu/lib64/libpython3.12.dylib")),
            Some(PathBuf::from("/opt/vu"))
        );
        assert_eq!(derive_unix_prefix(Path::new("/opt/vu/python312.dll")), None);
        assert_eq!(
            derive_unix_prefix(Path::new("/opt/vu/libexec/libpython3.12.so")),
            None
        );
    }
}
