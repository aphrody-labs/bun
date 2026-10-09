// SPDX-License-Identifier: MIT
//! CLR host for Bun.
//!
//! [`locate`] finds the .NET install and its `hostfxr` with the `nethost` `get_hostfxr_path`
//! rules (explicit root, `DOTNET_ROOT_<ARCH>`/`DOTNET_ROOT`, registered install location,
//! default location), plus `dotnet` on `PATH`. `hostfxr` is opened at run time and never
//! linked. [`Hostfxr::main`] runs the `dotnet` muxer in the calling process
//! (`hostfxr_main_startupinfo`, as `dotnet.exe` does); [`Hostfxr::runtime`] initialises the
//! CLR once per process (`hostfxr_initialize_for_runtime_config`) and binds
//! `load_assembly_and_get_function_pointer`, `get_function_pointer` and `load_assembly`.
//! The C ABI of `include/bun_dotnet_host.h` is the `c-abi` feature.

#![allow(unsafe_code)]

use std::ffi::{OsStr, OsString, c_void};
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[cfg(feature = "c-abi")]
pub mod cabi;
mod library;

use library::Library;

/// `char_t` of the hosting headers: UTF-16 on Windows, bytes elsewhere.
#[cfg(windows)]
pub type CharT = u16;
#[cfg(not(windows))]
pub type CharT = std::ffi::c_char;

/// `UNMANAGEDCALLERSONLY_METHOD` from `coreclr_delegates.h`.
const UNMANAGED_CALLERS_ONLY: *const CharT = usize::MAX as *const CharT;

/// Status codes returned by `hostfxr` (`error_codes.h`), the ones Bun reports by name.
pub mod status {
    pub const SUCCESS: i32 = 0;
    pub const SUCCESS_HOST_ALREADY_INITIALIZED: i32 = 1;
    pub const SUCCESS_DIFFERENT_RUNTIME_PROPERTIES: i32 = 2;
    pub const INVALID_ARG_FAILURE: i32 = 0x8000_8081_u32 as i32;
    pub const CORE_HOST_LIB_MISSING_FAILURE: i32 = 0x8000_8083_u32 as i32;
    pub const FRAMEWORK_MISSING_FAILURE: i32 = 0x8000_8096_u32 as i32;
    pub const HOST_INVALID_STATE: i32 = 0x8000_80a3_u32 as i32;
}

#[derive(Debug, Clone)]
pub struct Error {
    /// The `hostfxr` or delegate status, when the failure came from .NET.
    pub code: Option<i32>,
    pub message: String,
}

impl Error {
    fn new(message: impl Into<String>) -> Self {
        Self {
            code: None,
            message: message.into(),
        }
    }
    fn hostfxr(operation: &str, code: i32, detail: String) -> Self {
        let detail = detail.trim();
        let message = if detail.is_empty() {
            format!("{operation} failed with status 0x{:08x}", code as u32)
        } else {
            format!(
                "{operation} failed with status 0x{:08x}: {detail}",
                code as u32
            )
        };
        Self {
            code: Some(code),
            message,
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// Where the .NET install was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Explicit,
    HostfxrOverride,
    Nethost,
    DotnetRootArch,
    DotnetRoot,
    RegisteredLocation,
    DefaultLocation,
    Path,
    UserHome,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Explicit => "explicit",
            Self::HostfxrOverride => "BUN_DOTNET_HOSTFXR",
            Self::Nethost => "nethost",
            Self::DotnetRootArch => DOTNET_ROOT_ARCH,
            Self::DotnetRoot => "DOTNET_ROOT",
            Self::RegisteredLocation => "registered install location",
            Self::DefaultLocation => "default install location",
            Self::Path => "PATH",
            Self::UserHome => "~/.dotnet",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Location {
    pub dotnet_root: PathBuf,
    pub hostfxr: PathBuf,
    pub source: Source,
}

impl Location {
    /// The `dotnet` muxer executable of this install (may be absent for runtime-only layouts).
    pub fn muxer(&self) -> PathBuf {
        self.dotnet_root.join(if cfg!(windows) {
            "dotnet.exe"
        } else {
            "dotnet"
        })
    }

    /// Installed SDK versions, ascending.
    pub fn sdks(&self) -> Vec<String> {
        versions_in(&self.dotnet_root.join("sdk"), |dir| {
            dir.join("dotnet.dll").is_file()
        })
    }

    /// Installed versions of a shared framework (`Microsoft.NETCore.App`, ...), ascending.
    pub fn frameworks(&self, name: &str) -> Vec<String> {
        versions_in(&self.dotnet_root.join("shared").join(name), |_| true)
    }
}

#[cfg(target_arch = "x86_64")]
const ARCH: &str = "x64";
#[cfg(target_arch = "aarch64")]
const ARCH: &str = "arm64";
#[cfg(target_arch = "x86")]
const ARCH: &str = "x86";
#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "x86")))]
const ARCH: &str = "unknown";

#[cfg(target_arch = "x86_64")]
const DOTNET_ROOT_ARCH: &str = "DOTNET_ROOT_X64";
#[cfg(target_arch = "aarch64")]
const DOTNET_ROOT_ARCH: &str = "DOTNET_ROOT_ARM64";
#[cfg(target_arch = "x86")]
const DOTNET_ROOT_ARCH: &str = "DOTNET_ROOT_X86";
#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64", target_arch = "x86")))]
const DOTNET_ROOT_ARCH: &str = "DOTNET_ROOT_UNKNOWN";

#[cfg(windows)]
const HOSTFXR_NAME: &str = "hostfxr.dll";
#[cfg(target_os = "macos")]
const HOSTFXR_NAME: &str = "libhostfxr.dylib";
#[cfg(all(unix, not(target_os = "macos")))]
const HOSTFXR_NAME: &str = "libhostfxr.so";

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

/// Locates `hostfxr`. `explicit_root` wins; then `BUN_DOTNET_HOSTFXR`, `BUN_DOTNET_NETHOST`
/// (its `get_hostfxr_path`), then the `nethost` order, then `dotnet` on `PATH` and `~/.dotnet`.
pub fn locate(explicit_root: Option<&Path>) -> Result<Location> {
    if let Some(root) = explicit_root {
        return in_root(root, Source::Explicit).ok_or_else(|| {
            Error::new(format!(
                "no {HOSTFXR_NAME} under {}/host/fxr",
                root.display()
            ))
        });
    }
    if let Some(hostfxr) = env_path("BUN_DOTNET_HOSTFXR") {
        let dotnet_root = hostfxr
            .parent()
            .and_then(Path::parent)
            .and_then(Path::parent)
            .and_then(Path::parent)
            .map(Path::to_path_buf)
            .unwrap_or_default();
        return Ok(Location {
            dotnet_root,
            hostfxr,
            source: Source::HostfxrOverride,
        });
    }
    if let Some(nethost) = env_path("BUN_DOTNET_NETHOST") {
        return nethost_location(&nethost);
    }
    let mut tried = Vec::new();
    for (source, root) in candidate_roots() {
        if let Some(location) = in_root(&root, source) {
            return Ok(location);
        }
        tried.push(format!("{} ({})", root.display(), source.as_str()));
    }
    Err(Error::new(format!(
        "no .NET install found (looked for host/fxr/<version>/{HOSTFXR_NAME} in {}); install .NET 10 or set DOTNET_ROOT",
        if tried.is_empty() {
            "no candidate".to_owned()
        } else {
            tried.join(", ")
        }
    )))
}

fn candidate_roots() -> Vec<(Source, PathBuf)> {
    let mut roots = Vec::new();
    if let Some(root) = env_path(DOTNET_ROOT_ARCH) {
        roots.push((Source::DotnetRootArch, root));
    }
    if let Some(root) = env_path("DOTNET_ROOT") {
        roots.push((Source::DotnetRoot, root));
    }
    if let Some(root) = registered_location() {
        roots.push((Source::RegisteredLocation, root));
    }
    roots.push((Source::DefaultLocation, default_location()));
    if let Some(root) = path_location() {
        roots.push((Source::Path, root));
    }
    if let Some(home) = env_path(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        roots.push((Source::UserHome, home.join(".dotnet")));
    }
    roots
}

fn in_root(root: &Path, source: Source) -> Option<Location> {
    let fxr = root.join("host").join("fxr");
    let version = versions_in(&fxr, |dir| dir.join(HOSTFXR_NAME).is_file()).pop()?;
    Some(Location {
        dotnet_root: root.to_path_buf(),
        hostfxr: fxr.join(version).join(HOSTFXR_NAME),
        source,
    })
}

#[cfg(windows)]
fn registered_location() -> Option<PathBuf> {
    use windows_sys::Win32::System::Registry::{
        HKEY_LOCAL_MACHINE, KEY_WOW64_32KEY, RRF_RT_REG_SZ, RegGetValueW,
    };
    let key = wide(OsStr::new(&format!(
        r"SOFTWARE\dotnet\Setup\InstalledVersions\{ARCH}"
    )));
    let value = wide(OsStr::new("InstallLocation"));
    let mut buffer = vec![0u16; 1024];
    let mut size = (buffer.len() * 2) as u32;
    // SAFETY: key/value are NUL-terminated UTF-16, buffer/size describe a writable buffer.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_SZ | KEY_WOW64_32KEY,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if status != 0 {
        return None;
    }
    let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    use std::os::windows::ffi::OsStringExt;
    let path = PathBuf::from(OsString::from_wide(&buffer[..len]));
    (!path.as_os_str().is_empty()).then_some(path)
}

#[cfg(unix)]
fn registered_location() -> Option<PathBuf> {
    for file in [
        format!("/etc/dotnet/install_location_{ARCH}"),
        "/etc/dotnet/install_location".to_owned(),
    ] {
        if let Ok(text) = std::fs::read_to_string(&file)
            && let Some(line) = text.lines().map(str::trim).find(|line| !line.is_empty())
        {
            return Some(PathBuf::from(line));
        }
    }
    None
}

#[cfg(windows)]
fn default_location() -> PathBuf {
    let program_files = env_path("ProgramW6432")
        .or_else(|| env_path("ProgramFiles"))
        .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
    program_files.join("dotnet")
}

#[cfg(target_os = "macos")]
fn default_location() -> PathBuf {
    PathBuf::from("/usr/local/share/dotnet")
}

#[cfg(all(unix, not(target_os = "macos")))]
fn default_location() -> PathBuf {
    for root in ["/usr/share/dotnet", "/usr/lib/dotnet", "/usr/lib64/dotnet"] {
        if Path::new(root).join("host").is_dir() {
            return PathBuf::from(root);
        }
    }
    PathBuf::from("/usr/share/dotnet")
}

/// The directory of the real `dotnet` on `PATH` (symlinks resolved), skipping this process.
fn path_location() -> Option<PathBuf> {
    let name = if cfg!(windows) {
        "dotnet.exe"
    } else {
        "dotnet"
    };
    let own = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.canonicalize().ok());
    for dir in std::env::split_paths(&std::env::var_os("PATH")?) {
        let Ok(candidate) = dir.join(name).canonicalize() else {
            continue;
        };
        if Some(&candidate) == own.as_ref() {
            continue;
        }
        if let Some(root) = candidate.parent() {
            return Some(root.to_path_buf());
        }
    }
    None
}

/// Subdirectory names of `dir` that parse as versions and satisfy `accept`, ascending.
fn versions_in(dir: &Path, accept: impl Fn(&Path) -> bool) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut versions: Vec<(Version, String)> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().into_string().ok()?;
            let version = Version::parse(&name)?;
            accept(&entry.path()).then_some((version, name))
        })
        .collect();
    versions.sort();
    versions.into_iter().map(|(_, name)| name).collect()
}

/// `major.minor.patch[-pre]`; a release sorts after its prereleases.
#[derive(Debug, PartialEq, Eq, PartialOrd, Ord)]
struct Version {
    numbers: [u64; 3],
    release: bool,
    pre: String,
}

impl Version {
    fn parse(text: &str) -> Option<Self> {
        let (core, pre) = match text.split_once('-') {
            Some((core, pre)) => (core, pre.to_owned()),
            None => (text, String::new()),
        };
        let mut numbers = [0u64; 3];
        let mut parts = core.split('.');
        for slot in &mut numbers {
            *slot = parts.next()?.parse().ok()?;
        }
        if parts.next().is_some() {
            return None;
        }
        Some(Self {
            numbers,
            release: pre.is_empty(),
            pre,
        })
    }
}

fn nethost_location(nethost: &Path) -> Result<Location> {
    type GetHostfxrPath = unsafe extern "C" fn(*mut CharT, *mut usize, *const c_void) -> i32;
    let library = Library::open(nethost).map_err(|error| {
        Error::new(format!(
            "cannot load nethost {}: {error}",
            nethost.display()
        ))
    })?;
    // SAFETY: signature of `get_hostfxr_path` in nethost.h.
    let get: GetHostfxrPath = unsafe { library.symbol("get_hostfxr_path") }
        .ok_or_else(|| Error::new("nethost is missing get_hostfxr_path"))?;
    let mut buffer = vec![0 as CharT; 4096];
    let mut size = buffer.len();
    // SAFETY: buffer/size describe a writable buffer; null parameters select the default lookup.
    let code = unsafe { get(buffer.as_mut_ptr(), &mut size, std::ptr::null()) };
    if code != 0 {
        return Err(Error::hostfxr("get_hostfxr_path", code, String::new()));
    }
    let len = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    let hostfxr = from_char_t(&buffer[..len]);
    let dotnet_root = hostfxr
        .ancestors()
        .nth(4)
        .map(Path::to_path_buf)
        .unwrap_or_default();
    Ok(Location {
        dotnet_root,
        hostfxr,
        source: Source::Nethost,
    })
}

// ─── char_t conversion ────────────────────────────────────────────────────────────────────────

#[cfg(windows)]
fn wide(text: &OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    text.encode_wide().chain(std::iter::once(0)).collect()
}

/// NUL-terminated `char_t` string.
pub fn to_char_t(text: &OsStr) -> Result<Vec<CharT>> {
    #[cfg(windows)]
    {
        let out = wide(text);
        if out[..out.len() - 1].contains(&0) {
            return Err(Error::new("argument contains NUL"));
        }
        Ok(out)
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let bytes = text.as_bytes();
        if bytes.contains(&0) {
            return Err(Error::new("argument contains NUL"));
        }
        Ok(bytes
            .iter()
            .map(|&b| b as CharT)
            .chain(std::iter::once(0))
            .collect())
    }
}

fn from_char_t(text: &[CharT]) -> PathBuf {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStringExt;
        PathBuf::from(OsString::from_wide(text))
    }
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        PathBuf::from(OsString::from_vec(text.iter().map(|&c| c as u8).collect()))
    }
}

/// # Safety
/// `ptr` is null or a NUL-terminated `char_t` string.
unsafe fn char_t_to_string(ptr: *const CharT) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0;
    // SAFETY: caller contract, scanning up to the terminator.
    while unsafe { *ptr.add(len) } != 0 {
        len += 1;
    }
    // SAFETY: `len` elements were just read.
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };
    from_char_t(slice).to_string_lossy().into_owned()
}

// ─── hostfxr ──────────────────────────────────────────────────────────────────────────────────

type Handle = *mut c_void;

#[repr(C)]
struct InitializeParameters {
    size: usize,
    host_path: *const CharT,
    dotnet_root: *const CharT,
}

type MainStartupInfo =
    unsafe extern "C" fn(i32, *const *const CharT, *const CharT, *const CharT, *const CharT) -> i32;
type InitializeForRuntimeConfig =
    unsafe extern "C" fn(*const CharT, *const InitializeParameters, *mut Handle) -> i32;
type InitializeForDotnetCommandLine =
    unsafe extern "C" fn(i32, *const *const CharT, *const InitializeParameters, *mut Handle) -> i32;
type GetRuntimeDelegate = unsafe extern "C" fn(Handle, i32, *mut *mut c_void) -> i32;
type RunApp = unsafe extern "C" fn(Handle) -> i32;
type Close = unsafe extern "C" fn(Handle) -> i32;
type ErrorWriter = unsafe extern "C" fn(*const CharT);
type SetErrorWriter = unsafe extern "C" fn(Option<ErrorWriter>) -> Option<ErrorWriter>;

type LoadAssemblyAndGetFunctionPointer = unsafe extern "system" fn(
    *const CharT,
    *const CharT,
    *const CharT,
    *const CharT,
    *mut c_void,
    *mut *mut c_void,
) -> i32;
type GetFunctionPointer = unsafe extern "system" fn(
    *const CharT,
    *const CharT,
    *const CharT,
    *mut c_void,
    *mut c_void,
    *mut *mut c_void,
) -> i32;
type LoadAssembly = unsafe extern "system" fn(*const CharT, *mut c_void, *mut c_void) -> i32;

const HDT_LOAD_ASSEMBLY_AND_GET_FUNCTION_POINTER: i32 = 5;
const HDT_GET_FUNCTION_POINTER: i32 = 6;
const HDT_LOAD_ASSEMBLY: i32 = 7;

/// `hostfxr` opened once per process (the CLR cannot be unloaded).
pub struct Hostfxr {
    location: Location,
    _library: Library,
    main_startupinfo: MainStartupInfo,
    initialize_for_runtime_config: InitializeForRuntimeConfig,
    initialize_for_dotnet_command_line: InitializeForDotnetCommandLine,
    get_runtime_delegate: GetRuntimeDelegate,
    run_app: RunApp,
    close: Close,
    set_error_writer: SetErrorWriter,
    runtime: Mutex<Option<std::result::Result<Runtime, Error>>>,
}

// SAFETY: function pointers into a library that stays loaded for the process lifetime.
unsafe impl Send for Hostfxr {}
// SAFETY: see above; mutable state is behind the mutex.
unsafe impl Sync for Hostfxr {}

static HOSTFXR: OnceLock<std::result::Result<Hostfxr, Error>> = OnceLock::new();

thread_local! {
    static ERRORS: std::cell::RefCell<String> = const { std::cell::RefCell::new(String::new()) };
}

unsafe extern "C" fn collect_error(message: *const CharT) {
    // SAFETY: hostfxr passes a NUL-terminated message valid for the call.
    let text = unsafe { char_t_to_string(message) };
    ERRORS.with(|errors| {
        let mut errors = errors.borrow_mut();
        if !errors.is_empty() {
            errors.push('\n');
        }
        errors.push_str(&text);
    });
}

/// The process-wide `hostfxr` of [`locate`]`(None)`.
pub fn hostfxr() -> Result<&'static Hostfxr> {
    HOSTFXR
        .get_or_init(|| locate(None).and_then(Hostfxr::open))
        .as_ref()
        .map_err(Clone::clone)
}

impl Hostfxr {
    fn open(location: Location) -> Result<Self> {
        let library = Library::open(&location.hostfxr).map_err(|error| {
            Error::new(format!(
                "cannot load {}: {error}",
                location.hostfxr.display()
            ))
        })?;
        macro_rules! sym {
            ($name:literal) => {
                // SAFETY: each type matches its declaration in hostfxr.h.
                unsafe { library.symbol($name) }.ok_or_else(|| {
                    Error::new(format!(
                        "{} is missing {}",
                        location.hostfxr.display(),
                        $name
                    ))
                })?
            };
        }
        Ok(Self {
            main_startupinfo: sym!("hostfxr_main_startupinfo"),
            initialize_for_runtime_config: sym!("hostfxr_initialize_for_runtime_config"),
            initialize_for_dotnet_command_line: sym!("hostfxr_initialize_for_dotnet_command_line"),
            get_runtime_delegate: sym!("hostfxr_get_runtime_delegate"),
            run_app: sym!("hostfxr_run_app"),
            close: sym!("hostfxr_close"),
            set_error_writer: sym!("hostfxr_set_error_writer"),
            _library: library,
            location,
            runtime: Mutex::new(None),
        })
    }

    pub fn location(&self) -> &Location {
        &self.location
    }

    /// Runs `body` with hostfxr errors captured instead of printed to stderr.
    fn capture<T>(&self, body: impl FnOnce() -> T) -> (T, String) {
        ERRORS.with(|errors| errors.borrow_mut().clear());
        // SAFETY: `collect_error` matches `hostfxr_error_writer_fn`; restored below.
        let previous = unsafe { (self.set_error_writer)(Some(collect_error)) };
        let value = body();
        // SAFETY: restores the writer in place before the call.
        unsafe { (self.set_error_writer)(previous) };
        (
            value,
            ERRORS.with(|errors| std::mem::take(&mut *errors.borrow_mut())),
        )
    }

    /// Runs the `dotnet` muxer in this process: `args` excludes the program name
    /// (`["build", "-c", "Release"]`). Returns the muxer exit code.
    pub fn main<I, S>(&self, args: I) -> Result<i32>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let root = &self.location.dotnet_root;
        let host = self.location.muxer();
        let app = root.join("dotnet.dll");
        let mut owned = vec![to_char_t(host.as_os_str())?];
        for arg in args {
            owned.push(to_char_t(arg.as_ref())?);
        }
        let argv: Vec<*const CharT> = owned.iter().map(|arg| arg.as_ptr()).collect();
        let host = to_char_t(host.as_os_str())?;
        let root = to_char_t(root.as_os_str())?;
        let app = to_char_t(app.as_os_str())?;
        // SAFETY: argv holds NUL-terminated strings alive for the call, as dotnet.cpp passes them.
        Ok(unsafe {
            (self.main_startupinfo)(
                argv.len() as i32,
                argv.as_ptr(),
                host.as_ptr(),
                root.as_ptr(),
                app.as_ptr(),
            )
        })
    }

    /// `hostfxr_initialize_for_dotnet_command_line` + `hostfxr_run_app`: runs a built app
    /// (`app.dll arg...`) in this process. Must be the first CLR use of the process.
    pub fn run_app<I, S>(&self, args: I) -> Result<i32>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let owned = args
            .into_iter()
            .map(|arg| to_char_t(arg.as_ref()))
            .collect::<Result<Vec<_>>>()?;
        if owned.is_empty() {
            return Err(Error::new("run_app requires the application path"));
        }
        let argv: Vec<*const CharT> = owned.iter().map(|arg| arg.as_ptr()).collect();
        let root = to_char_t(self.location.dotnet_root.as_os_str())?;
        let params = InitializeParameters {
            size: size_of::<InitializeParameters>(),
            host_path: std::ptr::null(),
            dotnet_root: root.as_ptr(),
        };
        let mut handle: Handle = std::ptr::null_mut();
        let (code, detail) = self.capture(|| {
            // SAFETY: argv/params outlive the call; handle is writable.
            unsafe {
                (self.initialize_for_dotnet_command_line)(
                    argv.len() as i32,
                    argv.as_ptr(),
                    &params,
                    &mut handle,
                )
            }
        });
        if code != status::SUCCESS {
            if !handle.is_null() {
                // SAFETY: handle returned by hostfxr.
                unsafe { (self.close)(handle) };
            }
            return Err(Error::hostfxr(
                "hostfxr_initialize_for_dotnet_command_line",
                code,
                detail,
            ));
        }
        // SAFETY: valid, initialised host context.
        let exit = unsafe { (self.run_app)(handle) };
        // SAFETY: handle returned by hostfxr.
        unsafe { (self.close)(handle) };
        Ok(exit)
    }

    /// The CLR of this process, started on first use with `runtime_config` (a
    /// `.runtimeconfig.json`), `BUN_DOTNET_RUNTIME_CONFIG`, or a generated config for the
    /// highest installed `Microsoft.NETCore.App`. Later calls return the same runtime.
    pub fn runtime(&self, runtime_config: Option<&Path>) -> Result<Runtime> {
        let mut slot = self
            .runtime
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(runtime) = slot.as_ref() {
            return runtime.clone();
        }
        let started = self.start(runtime_config);
        *slot = Some(started.clone());
        started
    }

    fn start(&self, runtime_config: Option<&Path>) -> Result<Runtime> {
        let config = match runtime_config
            .map(Path::to_path_buf)
            .or_else(|| env_path("BUN_DOTNET_RUNTIME_CONFIG"))
        {
            Some(config) => config,
            None => self.generated_runtime_config()?,
        };
        let config_t = to_char_t(config.as_os_str())?;
        let root = to_char_t(self.location.dotnet_root.as_os_str())?;
        let params = InitializeParameters {
            size: size_of::<InitializeParameters>(),
            host_path: std::ptr::null(),
            dotnet_root: root.as_ptr(),
        };
        let mut handle: Handle = std::ptr::null_mut();
        let (code, detail) = self.capture(|| {
            // SAFETY: strings/params outlive the call; handle is writable.
            unsafe { (self.initialize_for_runtime_config)(config_t.as_ptr(), &params, &mut handle) }
        });
        if !(status::SUCCESS..=status::SUCCESS_DIFFERENT_RUNTIME_PROPERTIES).contains(&code) {
            if !handle.is_null() {
                // SAFETY: handle returned by hostfxr.
                unsafe { (self.close)(handle) };
            }
            return Err(Error::hostfxr(
                &format!(
                    "hostfxr_initialize_for_runtime_config({})",
                    config.display()
                ),
                code,
                detail,
            ));
        }
        let delegate = |kind: i32, name: &str| -> Result<*mut c_void> {
            let mut out: *mut c_void = std::ptr::null_mut();
            let (code, detail) = self.capture(|| {
                // SAFETY: valid host context; out is writable.
                unsafe { (self.get_runtime_delegate)(handle, kind, &mut out) }
            });
            if code != status::SUCCESS || out.is_null() {
                return Err(Error::hostfxr(
                    &format!("hostfxr_get_runtime_delegate({name})"),
                    code,
                    detail,
                ));
            }
            Ok(out)
        };
        let result = (|| {
            Ok(Runtime {
                // SAFETY: the delegate kinds return these coreclr_delegates.h signatures.
                load_assembly_and_get_function_pointer: unsafe {
                    std::mem::transmute::<*mut c_void, LoadAssemblyAndGetFunctionPointer>(delegate(
                        HDT_LOAD_ASSEMBLY_AND_GET_FUNCTION_POINTER,
                        "load_assembly_and_get_function_pointer",
                    )?)
                },
                // SAFETY: as above.
                get_function_pointer: unsafe {
                    std::mem::transmute::<*mut c_void, GetFunctionPointer>(delegate(
                        HDT_GET_FUNCTION_POINTER,
                        "get_function_pointer",
                    )?)
                },
                // SAFETY: as above.
                load_assembly: unsafe {
                    std::mem::transmute::<*mut c_void, LoadAssembly>(delegate(
                        HDT_LOAD_ASSEMBLY,
                        "load_assembly",
                    )?)
                },
                init_status: code,
                runtime_config: Box::leak(config.to_string_lossy().into_owned().into_boxed_str()),
            })
        })();
        // The delegates stay valid after the context closes; the runtime stays loaded.
        // SAFETY: handle returned by hostfxr.
        unsafe { (self.close)(handle) };
        result
    }

    fn generated_runtime_config(&self) -> Result<PathBuf> {
        let version = self
            .location
            .frameworks("Microsoft.NETCore.App")
            .pop()
            .ok_or_else(|| {
                Error::new(format!(
                    "no Microsoft.NETCore.App runtime under {}",
                    self.location.dotnet_root.display()
                ))
            })?;
        let major = version.split('.').next().unwrap_or("10");
        let text = format!(
            "{{\n  \"runtimeOptions\": {{\n    \"tfm\": \"net{major}.0\",\n    \"rollForward\": \"LatestMinor\",\n    \"framework\": {{ \"name\": \"Microsoft.NETCore.App\", \"version\": \"{major}.0.0\" }}\n  }}\n}}\n"
        );
        let dir = std::env::temp_dir().join("bun-dotnet");
        std::fs::create_dir_all(&dir)
            .map_err(|error| Error::new(format!("cannot create {}: {error}", dir.display())))?;
        let path = dir.join(format!("net{major}.runtimeconfig.json"));
        if std::fs::read_to_string(&path).ok().as_deref() != Some(text.as_str()) {
            let partial = dir.join(format!("net{major}.{}.tmp", std::process::id()));
            std::fs::write(&partial, &text)
                .and_then(|()| std::fs::rename(&partial, &path))
                .map_err(|error| Error::new(format!("cannot write {}: {error}", path.display())))?;
        }
        Ok(path)
    }
}

/// Delegates of the started CLR.
#[derive(Clone, Copy)]
pub struct Runtime {
    load_assembly_and_get_function_pointer: LoadAssemblyAndGetFunctionPointer,
    get_function_pointer: GetFunctionPointer,
    load_assembly: LoadAssembly,
    /// `hostfxr_initialize_for_runtime_config` status: 0 started here, 1/2 already running.
    pub init_status: i32,
    /// Leaked once per process so the struct stays `Copy`.
    runtime_config: &'static str,
}

impl Runtime {
    pub fn runtime_config(&self) -> &str {
        self.runtime_config
    }
}

// SAFETY: CLR delegates are callable from any thread.
unsafe impl Send for Runtime {}
// SAFETY: as above.
unsafe impl Sync for Runtime {}

impl Runtime {
    /// A native function pointer for `type_name::method`. `assembly` loads that assembly in
    /// its own load context first (`load_assembly_and_get_function_pointer`); without it the
    /// type is resolved in the default context (`get_function_pointer`). `delegate_type`
    /// `None` targets an `[UnmanagedCallersOnly]` method.
    pub fn function_pointer(
        &self,
        hostfxr: &Hostfxr,
        assembly: Option<&Path>,
        type_name: &str,
        method: &str,
        delegate_type: Option<&str>,
    ) -> Result<*mut c_void> {
        let type_t = to_char_t(OsStr::new(type_name))?;
        let method_t = to_char_t(OsStr::new(method))?;
        let delegate_t = delegate_type
            .map(|name| to_char_t(OsStr::new(name)))
            .transpose()?;
        let delegate_ptr = delegate_t
            .as_ref()
            .map_or(UNMANAGED_CALLERS_ONLY, |name| name.as_ptr());
        let mut out: *mut c_void = std::ptr::null_mut();
        let (code, detail) = match assembly {
            Some(assembly) => {
                let assembly_t = to_char_t(absolute(assembly).as_os_str())?;
                hostfxr.capture(|| {
                    // SAFETY: NUL-terminated strings outlive the call; out is writable.
                    unsafe {
                        (self.load_assembly_and_get_function_pointer)(
                            assembly_t.as_ptr(),
                            type_t.as_ptr(),
                            method_t.as_ptr(),
                            delegate_ptr,
                            std::ptr::null_mut(),
                            &mut out,
                        )
                    }
                })
            }
            None => hostfxr.capture(|| {
                // SAFETY: as above.
                unsafe {
                    (self.get_function_pointer)(
                        type_t.as_ptr(),
                        method_t.as_ptr(),
                        delegate_ptr,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                        &mut out,
                    )
                }
            }),
        };
        if code != status::SUCCESS || out.is_null() {
            return Err(Error::hostfxr(
                &format!("{type_name}::{method}"),
                code,
                describe(code, detail),
            ));
        }
        Ok(out)
    }

    /// Loads an assembly into the default load context (`load_assembly`), making its types
    /// visible to [`Runtime::function_pointer`] without an assembly path.
    pub fn load_assembly(&self, hostfxr: &Hostfxr, assembly: &Path) -> Result<()> {
        let assembly_t = to_char_t(absolute(assembly).as_os_str())?;
        let (code, detail) = hostfxr.capture(|| {
            // SAFETY: NUL-terminated path outlives the call.
            unsafe {
                (self.load_assembly)(
                    assembly_t.as_ptr(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
            }
        });
        if code != status::SUCCESS {
            return Err(Error::hostfxr(
                &format!("load_assembly({})", assembly.display()),
                code,
                describe(code, detail),
            ));
        }
        Ok(())
    }
}

/// HRESULTs the CLR returns from the delegates, named.
fn describe(code: i32, detail: String) -> String {
    if !detail.trim().is_empty() {
        return detail;
    }
    match code as u32 {
        0x8013_1522 => "type not found (TypeLoadException)".to_owned(),
        0x8013_1513 | 0x8013_1511 => "method not found (MissingMethodException)".to_owned(),
        0x8007_0002 => "assembly file not found (FileNotFoundException)".to_owned(),
        0x8007_000B => "bad image format (BadImageFormatException)".to_owned(),
        0x8007_0057 => "invalid argument (method must be static; UnmanagedCallersOnly or delegate signature mismatch)".to_owned(),
        _ => String::new(),
    }
}

fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}
