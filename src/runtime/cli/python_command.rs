// SPDX-License-Identifier: MIT
//! Lazy dispatch for Python source files through the separately installed shared host.

use core::ffi::{c_char, c_int};
use std::ffi::{CStr, CString};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use bun_core::{Global, ZStr, strings};
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
    HOST.get_or_init(load_host).as_ref().map_err(Clone::clone)
}

fn load_host() -> Result<HostApi, String> {
    let host_path = bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_HOST_LIBRARY"))
        .ok_or_else(|| format!("set {HOST_LIBRARY_ENV} to the installed Python host library"))?;
    let host_path = std::str::from_utf8(host_path)
        .map_err(|_| format!("{HOST_LIBRARY_ENV} must be a UTF-8 path"))?;
    let library = DynLib::open(host_path.as_bytes())
        .map_err(|error| format!("cannot load Python host {host_path}: {error}"))?;

    let abi_version: AbiVersion = unsafe {
        // SAFETY: the selected host exports the version function with the no-argument C ABI.
        lookup(&library, bun_core::zstr!("bun_py_abi_version"))
    }
    .ok_or_else(|| "Python host is missing bun_py_abi_version".to_owned())?;
    // SAFETY: the symbol uses the declared no-argument C ABI.
    let version = unsafe { abi_version() };
    if version != ABI_VERSION {
        return Err(format!(
            "unsupported Python host ABI {version}; expected {ABI_VERSION}"
        ));
    }

    let load_python: LoadPython = unsafe {
        // SAFETY: ABI v1 declares this symbol with the LoadPython signature.
        lookup(&library, bun_core::zstr!("aphrody_py_load"))
    }
    .ok_or_else(|| "Python host is missing aphrody_py_load".to_owned())?;
    // SAFETY: ABI v1 declares this symbol with the PythonMain signature.
    let python_main: PythonMain = unsafe { lookup(&library, bun_core::zstr!("bun_py_main")) }
        .ok_or_else(|| "Python host is missing bun_py_main".to_owned())?;
    let last_error: LastError = unsafe {
        // SAFETY: ABI v1 declares this symbol with the LastError signature.
        lookup(&library, bun_core::zstr!("aphrody_py_last_error"))
    }
    .ok_or_else(|| "Python host is missing aphrody_py_last_error".to_owned())?;
    let free_string: FreeString = unsafe {
        // SAFETY: ABI v1 declares this symbol with the FreeString signature.
        lookup(&library, bun_core::zstr!("aphrody_py_string_free"))
    }
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

/// Reads a path variable; an empty value counts as unset.
fn env_path(key: &ZStr, name: &str) -> Result<Option<&'static str>, String> {
    match bun_core::getenv_z(key) {
        None | Some(b"") => Ok(None),
        Some(value) => std::str::from_utf8(value)
            .map(Some)
            .map_err(|_| format!("{name} must be a UTF-8 path")),
    }
}

/// The selected CPython: `argv[0]` and the shared library that must match it.
struct Interpreter {
    executable: String,
    libpython: String,
}

/// An active `VIRTUAL_ENV`, else the nearest `.venv` of the current directory or its
/// parents (where `uv sync` creates a project environment) selects the interpreter.
/// `BUN_PYTHON_EXECUTABLE` / `BUN_PYTHON_LIBPYTHON` are the default outside a project.
fn select_interpreter() -> Result<Interpreter, String> {
    if let Some(venv) = environment()? {
        return environment_interpreter(&venv);
    }
    let libpython = env_path(bun_core::zstr!("BUN_PYTHON_LIBPYTHON"), LIBPYTHON_ENV)?
        .ok_or_else(|| format!("set {LIBPYTHON_ENV} to the selected runtime's shared library"))?;
    Ok(Interpreter {
        executable: python_executable(Path::new(libpython))?,
        libpython: libpython.to_owned(),
    })
}

fn environment() -> Result<Option<PathBuf>, String> {
    if let Some(venv) = env_path(bun_core::zstr!("VIRTUAL_ENV"), "VIRTUAL_ENV")? {
        return Ok(Some(PathBuf::from(venv)));
    }
    Ok(project_environment())
}

fn project_environment() -> Option<PathBuf> {
    let cwd = bun_sys::getcwd_alloc().ok()?;
    let mut dir = Some(Path::new(std::str::from_utf8(cwd.as_bytes()).ok()?));
    while let Some(current) = dir {
        let venv = current.join(".venv");
        if bun_sys::exists(venv.join("pyvenv.cfg").to_str()?.as_bytes()) {
            return Some(venv);
        }
        dir = current.parent();
    }
    None
}

fn environment_bin(venv: &Path) -> PathBuf {
    venv.join(if cfg!(windows) { "Scripts" } else { "bin" })
}

fn environment_interpreter(venv: &Path) -> Result<Interpreter, String> {
    let bin_dir = environment_bin(venv);
    #[cfg(windows)]
    let names = ["python.exe"];
    #[cfg(not(windows))]
    let names = ["python", "python3"];
    let executable = names
        .iter()
        .find_map(|name| {
            is_executable(&bin_dir.join(name), "virtual environment Python executable").ok()
        })
        .ok_or_else(|| {
            format!(
                "virtual environment has no executable Python entry point: {}",
                venv.display()
            )
        })?;

    let config_path = venv.join("pyvenv.cfg");
    let config = config_path
        .to_str()
        .and_then(|path| bun_sys::File::read_from(bun_sys::Fd::cwd(), path.as_bytes()).ok())
        .map(|text| parse_venv_config(&text))
        .unwrap_or_default();
    let derived = config
        .home
        .as_deref()
        .zip(config.version)
        .and_then(|(home, version)| {
            libpython_candidates(Path::new(home), version)
                .into_iter()
                .find(|candidate| bun_sys::exists(candidate.as_bytes()))
        });
    if let Some(libpython) = derived {
        return Ok(Interpreter {
            executable,
            libpython,
        });
    }

    let libpython =
        env_path(bun_core::zstr!("BUN_PYTHON_LIBPYTHON"), LIBPYTHON_ENV)?.ok_or_else(|| {
            format!(
                "cannot find the shared library of {}; set {LIBPYTHON_ENV}",
                venv.display()
            )
        })?;
    if let (Some(wanted), Some(selected)) = (config.version, library_version(libpython)) {
        if wanted != selected {
            return Err(format!(
                "{} uses Python {}.{} but {LIBPYTHON_ENV} is Python {}.{}: {libpython}",
                venv.display(),
                wanted.0,
                wanted.1,
                selected.0,
                selected.1
            ));
        }
    }
    Ok(Interpreter {
        executable,
        libpython: libpython.to_owned(),
    })
}

#[derive(Debug, Default, PartialEq)]
struct VenvConfig {
    home: Option<String>,
    version: Option<(u32, u32)>,
}

/// `pyvenv.cfg` as written by `venv` (`version`) and uv (`version_info`).
fn parse_venv_config(text: &[u8]) -> VenvConfig {
    let mut config = VenvConfig::default();
    for line in strings::split(text, b"\n") {
        let Some((key, value)) = strings::split_once_char(line, b'=') else {
            continue;
        };
        let value = value.trim_ascii();
        match key.trim_ascii() {
            b"home" => config.home = std::str::from_utf8(value).ok().map(str::to_owned),
            b"version" | b"version_info" => config.version = parse_version(value),
            _ => {}
        }
    }
    config
}

fn parse_version(value: &[u8]) -> Option<(u32, u32)> {
    let mut parts = strings::split(value, b".");
    let major = std::str::from_utf8(parts.next()?).ok()?.parse().ok()?;
    let minor = parts.next()?;
    let digits = minor
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count();
    let minor = std::str::from_utf8(&minor[..digits]).ok()?.parse().ok()?;
    Some((major, minor))
}

/// The shared library beside a base interpreter; `home` is its install root on Windows
/// and its `bin` directory elsewhere.
fn libpython_candidates(home: &Path, (major, minor): (u32, u32)) -> Vec<String> {
    #[cfg(windows)]
    let paths = vec![home.join(format!("python{major}{minor}.dll"))];
    #[cfg(target_os = "macos")]
    let paths = home
        .parent()
        .map(|prefix| {
            vec![
                prefix
                    .join("lib")
                    .join(format!("libpython{major}.{minor}.dylib")),
            ]
        })
        .unwrap_or_default();
    #[cfg(all(unix, not(target_os = "macos")))]
    let paths = home
        .parent()
        .map(|prefix| {
            let lib = prefix.join("lib");
            vec![
                lib.join(format!("libpython{major}.{minor}.so.1.0")),
                lib.join(format!("libpython{major}.{minor}.so")),
            ]
        })
        .unwrap_or_default();
    #[cfg(not(any(unix, windows)))]
    let paths: Vec<PathBuf> = {
        let _ = (home, major, minor);
        Vec::new()
    };
    paths
        .into_iter()
        .filter_map(|path| path.to_str().map(str::to_owned))
        .collect()
}

/// The version named by a `python3XY.dll` or `libpython3.X` file name.
fn library_version(path: &str) -> Option<(u32, u32)> {
    let name = bun_paths::resolve_path::basename(path.as_bytes());
    if let Some(rest) = name.strip_prefix(b"libpython") {
        return parse_version(rest);
    }
    let digits = name.strip_prefix(b"python")?;
    let digits = &digits[..digits
        .iter()
        .take_while(|byte| byte.is_ascii_digit())
        .count()];
    let (major, minor) = digits.split_first()?;
    if minor.is_empty() {
        return None;
    }
    let major = u32::from(major - b'0');
    let minor = std::str::from_utf8(minor).ok()?.parse().ok()?;
    Some((major, minor))
}

fn python_executable(libpython: &Path) -> Result<String, String> {
    #[cfg(not(unix))]
    let _ = libpython;

    if let Some(executable) = env_path(
        bun_core::zstr!("BUN_PYTHON_EXECUTABLE"),
        "BUN_PYTHON_EXECUTABLE",
    )? {
        return is_executable(Path::new(executable), "BUN_PYTHON_EXECUTABLE");
    }

    let prefix = if let Some(prefix) = env_path(bun_core::zstr!("BUV_RUNTIME"), "BUV_RUNTIME")?
        .or(env_path(bun_core::zstr!("VU_RUNTIME"), "VU_RUNTIME")?)
    {
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
            return Err("set BUV_RUNTIME or BUN_PYTHON_EXECUTABLE to select CPython".to_owned());
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

/// A `#!` line naming `python`, `python3` or `python3.X` directly or through `env`, or the
/// `/bin/sh` + `'''exec'` form installers write when the interpreter path is too long.
pub(crate) fn has_python_shebang(path: &[u8]) -> bool {
    let Ok(file) = bun_sys::File::openat(bun_sys::Fd::cwd(), path, bun_sys::O::RDONLY, 0) else {
        return false;
    };
    let mut head = [0u8; 512];
    let Ok(len) = file.read_all(&mut head) else {
        return false;
    };
    is_python_shebang(&head[..len])
}

fn is_python_shebang(head: &[u8]) -> bool {
    let Some(rest) = head.strip_prefix(b"#!") else {
        return false;
    };
    let end = strings::index_of_char_usize(rest, b'\n').unwrap_or(rest.len());
    let (line, next) = (&rest[..end], rest.get(end + 1..).unwrap_or_default());
    let mut words = strings::tokenize_any(line, b" \t\r");
    let Some(mut program) = words.next() else {
        return false;
    };
    let name = bun_paths::resolve_path::basename(program);
    if name == b"sh" {
        return next.starts_with(b"'''exec' ");
    }
    if name == b"env" {
        let Some(target) = words.find(|word| !word.starts_with(b"-")) else {
            return false;
        };
        program = target;
    }
    is_python_program_name(bun_paths::resolve_path::basename(program))
}

fn is_python_program_name(name: &[u8]) -> bool {
    let name = name.strip_suffix(b".exe").unwrap_or(name);
    name.strip_prefix(b"python").is_some_and(|rest| {
        rest.iter()
            .all(|byte| byte.is_ascii_digit() || *byte == b'.')
    })
}

/// A Windows script launcher (uv, pip, distlib) carries its program as an appended zip
/// application, which CPython executes directly.
#[cfg(windows)]
fn is_zip_application(path: &[u8]) -> bool {
    let Ok(file) = bun_sys::File::openat(bun_sys::Fd::cwd(), path, bun_sys::O::RDONLY, 0) else {
        return false;
    };
    let Ok(size) = file.get_end_pos() else {
        return false;
    };
    // The end-of-central-directory record follows the directory within the 64 KiB comment window.
    let window = size.min(64 * 1024 + 22 + 4096);
    let mut tail = vec![0u8; window];
    let Ok(read) = file.pread_all(&mut tail, (size - window) as u64) else {
        return false;
    };
    let tail = &tail[..read];
    strings::contains(tail, b"PK\x05\x06") && strings::contains(tail, b"__main__.py")
}

/// Runs a console script of the selected environment inside the hosted interpreter, as its
/// launcher would. Returns false when the host, the environment or a Python script is absent.
pub(crate) fn run_environment_script_if_present(name: &[u8], arguments: &[&[u8]]) -> bool {
    if !host_configured() || name.is_empty() || strings::index_of_any(name, b"/\\").is_some() {
        return false;
    }
    let (Ok(Some(venv)), Ok(name)) = (environment(), std::str::from_utf8(name)) else {
        return false;
    };
    #[cfg(windows)]
    let script = environment_bin(&venv).join(format!("{name}.exe"));
    #[cfg(not(windows))]
    let script = environment_bin(&venv).join(name);
    let Some(script) = script.to_str() else {
        return false;
    };
    #[cfg(windows)]
    let python = is_zip_application(script.as_bytes());
    #[cfg(not(windows))]
    let python = has_python_shebang(script.as_bytes());
    if !python {
        return false;
    }
    let mut python_arguments = Vec::with_capacity(arguments.len() + 1);
    python_arguments.push(script.as_bytes());
    python_arguments.extend_from_slice(arguments);
    run_if_configured(&python_arguments)
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
fn host_configured() -> bool {
    !matches!(
        bun_core::getenv_z(bun_core::zstr!("BUN_PYTHON_HOST_LIBRARY")),
        None | Some(b"")
    )
}

pub(crate) fn run_if_configured(arguments: &[&[u8]]) -> bool {
    if !host_configured() {
        return false;
    }

    if let Err(error) = run(arguments) {
        bun_core::pretty_errorln!("<r><red>error<r>: {}", error);
        Global::exit(1);
    }
    unreachable!("Python host exits the process with CPython's result")
}

fn run(arguments: &[&[u8]]) -> Result<(), String> {
    let Interpreter {
        executable,
        libpython,
    } = select_interpreter()?;
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
    let status = unsafe {
        (api.python_main)(
            pointers.len() as c_int,
            pointers.as_ptr(),
            &raw mut exit_code,
        )
    };
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
    fn reads_venv_and_uv_environment_configuration() {
        assert_eq!(
            parse_venv_config(b"home = C:\\Python312\r\ninclude-system-site-packages = false\r\nversion = 3.12.15\r\n"),
            VenvConfig {
                home: Some("C:\\Python312".to_owned()),
                version: Some((3, 12)),
            }
        );
        assert_eq!(
            parse_venv_config(b"home = /opt/cpython-3.14/bin\nimplementation = CPython\nuv = 0.12.24\nversion_info = 3.14\n"),
            VenvConfig {
                home: Some("/opt/cpython-3.14/bin".to_owned()),
                version: Some((3, 14)),
            }
        );
        assert_eq!(parse_version(b"3.13.0rc2"), Some((3, 13)));
        assert_eq!(parse_version(b"3"), None);
    }

    #[test]
    fn reads_the_version_of_a_shared_library_name() {
        assert_eq!(library_version("C:\\Python\\python314.dll"), Some((3, 14)));
        assert_eq!(
            library_version("/opt/lib/libpython3.12.so.1.0"),
            Some((3, 12))
        );
        assert_eq!(
            library_version("/opt/lib/libpython3.13.dylib"),
            Some((3, 13))
        );
        assert_eq!(library_version("python3.dll"), None);
    }

    #[test]
    fn recognizes_python_shebangs() {
        assert!(is_python_shebang(b"#!/usr/bin/env python3\nprint(1)\n"));
        assert!(is_python_shebang(b"#!/usr/bin/env -S python3.14 -u\r\n"));
        assert!(is_python_shebang(b"#!/opt/app/.venv/bin/python\n"));
        assert!(is_python_shebang(
            b"#!/bin/sh\n'''exec' \"/very long/.venv/bin/python\" \"$0\" \"$@\"\n' '''\n"
        ));
        assert!(!is_python_shebang(b"#!/bin/sh\necho hi\n"));
        assert!(!is_python_shebang(b"#!/usr/bin/env node\n"));
        assert!(!is_python_shebang(b"#!/usr/bin/env pythonista\n"));
        assert!(!is_python_shebang(b"print('no shebang')\n"));
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
