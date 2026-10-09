//! Windows version, edition and machine information.

use super::registry::{read_dword, read_string, root};
use super::{Json, WinErr, WinResult, BOOL, HANDLE};

const CURRENT_VERSION: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
const PERSONALIZE: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
const HKCU: u32 = 1;
const HKLM: u32 = 2;
/// First Windows 11 build.
pub(crate) const WINDOWS_11_BUILD: u32 = 22000;

#[repr(C)]
struct OsVersionInfoW {
    size: u32,
    major: u32,
    minor: u32,
    build: u32,
    platform_id: u32,
    csd_version: [u16; 128],
}

#[repr(C)]
#[derive(Default)]
struct MemoryStatusEx {
    length: u32,
    memory_load: u32,
    total_phys: u64,
    avail_phys: u64,
    total_page_file: u64,
    avail_page_file: u64,
    total_virtual: u64,
    avail_virtual: u64,
    avail_extended_virtual: u64,
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn RtlGetVersion(info: *mut OsVersionInfoW) -> i32;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentProcess() -> HANDLE;
    fn IsWow64Process2(
        process: HANDLE,
        process_machine: *mut u16,
        native_machine: *mut u16,
    ) -> BOOL;
    fn GlobalMemoryStatusEx(status: *mut MemoryStatusEx) -> BOOL;
    fn GetTickCount64() -> u64;
    fn GetComputerNameW(buf: *mut u16, len: *mut u32) -> BOOL;
    fn GetActiveProcessorCount(group: u16) -> u32;
}

#[link(name = "advapi32")]
unsafe extern "system" {
    fn GetUserNameW(buf: *mut u16, len: *mut u32) -> BOOL;
}

/// `(major, minor, build)` from `RtlGetVersion`, which is not subject to manifest-based
/// version lies.
pub(crate) fn version_numbers() -> (u32, u32, u32) {
    let mut info = OsVersionInfoW {
        size: core::mem::size_of::<OsVersionInfoW>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform_id: 0,
        csd_version: [0; 128],
    };
    // SAFETY: `info.size` is set; RtlGetVersion always succeeds.
    unsafe { RtlGetVersion(&mut info) };
    (info.major, info.minor, info.build)
}

fn machine_name(machine: u16) -> &'static str {
    match machine {
        0x8664 => "x64",
        0xAA64 => "arm64",
        0x014C => "ia32",
        0x01C4 => "arm",
        _ => "unknown",
    }
}

/// `(process arch, native arch)`. An x64 process on ARM64 reports `x64`/`arm64`.
fn architectures() -> (&'static str, &'static str) {
    let mut process = 0u16;
    let mut native = 0u16;
    // SAFETY: pseudo-handle of the current process; both outputs are valid.
    if unsafe { IsWow64Process2(GetCurrentProcess(), &mut process, &mut native) } == 0 {
        return ("unknown", "unknown");
    }
    let native_name = machine_name(native);
    // IMAGE_FILE_MACHINE_UNKNOWN: not running under WOW64, so the process matches the OS,
    // except for x64 emulation on ARM64, which WOW64 does not report.
    let process_name = if process == 0 {
        if cfg!(target_arch = "x86_64") {
            "x64"
        } else if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            native_name
        }
    } else {
        machine_name(process)
    };
    (process_name, native_name)
}

fn wide_name(f: unsafe extern "system" fn(*mut u16, *mut u32) -> BOOL) -> String {
    let mut buf = [0u16; 257];
    let mut len = buf.len() as u32;
    // SAFETY: `buf` is valid for `len` units.
    if unsafe { f(buf.as_mut_ptr(), &mut len) } == 0 {
        return String::new();
    }
    super::from_wide(&buf)
}

/// `{ major, minor, build, ubr, version, displayVersion, productName, edition, installationType,
/// isWindows11, arch, nativeArch }`.
pub(crate) fn version_json() -> String {
    let (major, minor, build) = version_numbers();
    let lm = root(HKLM);
    let reg = |name: &str| {
        lm.and_then(|k| read_string(k, CURRENT_VERSION, name))
            .unwrap_or_default()
    };
    let ubr = lm
        .and_then(|k| read_dword(k, CURRENT_VERSION, "UBR"))
        .unwrap_or(0);
    let is_11 = major == 10 && build >= WINDOWS_11_BUILD;
    let mut product = reg("ProductName");
    // The registry kept "Windows 10" in ProductName on Windows 11.
    if is_11 {
        if let Some(rest) = product.strip_prefix("Windows 10") {
            product = format!("Windows 11{rest}");
        }
    }
    let (arch, native_arch) = architectures();
    let mut j = Json::new();
    j.begin_object()
        .field_num("major", major as f64)
        .field_num("minor", minor as f64)
        .field_num("build", build as f64)
        .field_num("ubr", ubr as f64)
        .field_str("version", &format!("{major}.{minor}.{build}.{ubr}"))
        .field_str("displayVersion", &reg("DisplayVersion"))
        .field_str("productName", &product)
        .field_str("edition", &reg("EditionID"))
        .field_str("installationType", &reg("InstallationType"))
        .field_bool("isWindows11", is_11)
        .field_str("arch", arch)
        .field_str("nativeArch", native_arch)
        .end_object();
    j.finish()
}

fn memory_status() -> WinResult<MemoryStatusEx> {
    let mut mem = MemoryStatusEx {
        length: core::mem::size_of::<MemoryStatusEx>() as u32,
        ..Default::default()
    };
    // SAFETY: `mem.length` is set and Windows writes the documented structure fields.
    if unsafe { GlobalMemoryStatusEx(&mut mem) } == 0 {
        return Err(WinErr::last("GlobalMemoryStatusEx"));
    }
    Ok(mem)
}

/// `{ memoryLoad, totalPhysical, availablePhysical, totalPageFile, availablePageFile,
/// totalVirtual, availableVirtual }` in bytes, except `memoryLoad` which is a percentage.
pub(crate) fn memory_json() -> WinResult<String> {
    let mem = memory_status()?;
    let mut j = Json::new();
    j.begin_object()
        .field_num("memoryLoad", mem.memory_load as f64)
        .field_num("totalPhysical", mem.total_phys as f64)
        .field_num("availablePhysical", mem.avail_phys as f64)
        .field_num("totalPageFile", mem.total_page_file as f64)
        .field_num("availablePageFile", mem.avail_page_file as f64)
        .field_num("totalVirtual", mem.total_virtual as f64)
        .field_num("availableVirtual", mem.avail_virtual as f64)
        .end_object();
    Ok(j.finish())
}

/// `{ computerName, userName, processors, totalMemory, freeMemory, memoryLoad, uptime, theme }`.
/// `uptime` is in milliseconds; `theme` is the apps theme, `"dark"` or `"light"`.
pub(crate) fn info_json() -> WinResult<String> {
    let mem = memory_status()?;
    // SAFETY: no preconditions. ALL_PROCESSOR_GROUPS = 0xffff.
    let processors = unsafe { GetActiveProcessorCount(0xffff) };
    // SAFETY: no preconditions.
    let uptime = unsafe { GetTickCount64() };
    let light = root(HKCU)
        .and_then(|k| read_dword(k, PERSONALIZE, "AppsUseLightTheme"))
        .unwrap_or(1);
    let mut j = Json::new();
    j.begin_object()
        .field_str("computerName", &wide_name(GetComputerNameW))
        .field_str("userName", &wide_name(GetUserNameW))
        .field_num("processors", processors as f64)
        .field_num("totalMemory", mem.total_phys as f64)
        .field_num("freeMemory", mem.avail_phys as f64)
        .field_num("memoryLoad", mem.memory_load as f64)
        .field_num("uptime", uptime as f64)
        .field_str("theme", if light == 0 { "dark" } else { "light" })
        .end_object();
    Ok(j.finish())
}
