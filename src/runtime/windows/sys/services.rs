//! Service Control Manager: list, query, start and stop services (advapi32).

use super::{BOOL, Json, WinErr, WinResult, from_pwstr, wide};
use core::ffi::c_void;

type SC_HANDLE = *mut c_void;

const SC_MANAGER_CONNECT: u32 = 0x0001;
const SC_MANAGER_ENUMERATE_SERVICE: u32 = 0x0004;
const SERVICE_QUERY_CONFIG: u32 = 0x0001;
const SERVICE_QUERY_STATUS: u32 = 0x0004;
const SERVICE_START: u32 = 0x0010;
const SERVICE_STOP: u32 = 0x0020;
const SERVICE_CONTROL_STOP: u32 = 0x0001;
const SC_ENUM_PROCESS_INFO: u32 = 0;
const SC_STATUS_PROCESS_INFO: u32 = 0;
const SERVICE_STATE_ALL: u32 = 0x3;
pub(crate) const SERVICE_WIN32: u32 = 0x30;
pub(crate) const SERVICE_DRIVER: u32 = 0x0B;

const ERROR_SERVICE_ALREADY_RUNNING: u32 = 1056;
const ERROR_SERVICE_DOES_NOT_EXIST: u32 = 1060;
const ERROR_SERVICE_NOT_ACTIVE: u32 = 1062;

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct SERVICE_STATUS_PROCESS {
    dwServiceType: u32,
    dwCurrentState: u32,
    dwControlsAccepted: u32,
    dwWin32ExitCode: u32,
    dwServiceSpecificExitCode: u32,
    dwCheckPoint: u32,
    dwWaitHint: u32,
    dwProcessId: u32,
    dwServiceFlags: u32,
}

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct SERVICE_STATUS {
    dwServiceType: u32,
    dwCurrentState: u32,
    dwControlsAccepted: u32,
    dwWin32ExitCode: u32,
    dwServiceSpecificExitCode: u32,
    dwCheckPoint: u32,
    dwWaitHint: u32,
}

#[repr(C)]
struct ENUM_SERVICE_STATUS_PROCESSW {
    lpServiceName: *const u16,
    lpDisplayName: *const u16,
    ServiceStatusProcess: SERVICE_STATUS_PROCESS,
}

#[repr(C)]
struct QUERY_SERVICE_CONFIGW {
    dwServiceType: u32,
    dwStartType: u32,
    dwErrorControl: u32,
    lpBinaryPathName: *const u16,
    lpLoadOrderGroup: *const u16,
    dwTagId: u32,
    lpDependencies: *const u16,
    lpServiceStartName: *const u16,
    lpDisplayName: *const u16,
}

#[link(name = "advapi32")]
unsafe extern "system" {
    fn OpenSCManagerW(machine: *const u16, database: *const u16, access: u32) -> SC_HANDLE;
    fn OpenServiceW(scm: SC_HANDLE, name: *const u16, access: u32) -> SC_HANDLE;
    fn CloseServiceHandle(h: SC_HANDLE) -> BOOL;
    fn EnumServicesStatusExW(
        scm: SC_HANDLE,
        info_level: u32,
        service_type: u32,
        service_state: u32,
        services: *mut u8,
        buf_size: u32,
        bytes_needed: *mut u32,
        services_returned: *mut u32,
        resume_handle: *mut u32,
        group_name: *const u16,
    ) -> BOOL;
    fn QueryServiceStatusEx(
        h: SC_HANDLE,
        level: u32,
        buf: *mut u8,
        size: u32,
        needed: *mut u32,
    ) -> BOOL;
    fn QueryServiceConfigW(h: SC_HANDLE, config: *mut u8, size: u32, needed: *mut u32) -> BOOL;
    fn StartServiceW(h: SC_HANDLE, argc: u32, argv: *const *const u16) -> BOOL;
    fn ControlService(h: SC_HANDLE, control: u32, status: *mut SERVICE_STATUS) -> BOOL;
}

struct Sc(SC_HANDLE);

impl Drop for Sc {
    fn drop(&mut self) {
        // SAFETY: opened by this module and closed once.
        unsafe { CloseServiceHandle(self.0) };
    }
}

fn manager(access: u32) -> WinResult<Sc> {
    // SAFETY: null machine/database select the local active database.
    let h = unsafe { OpenSCManagerW(core::ptr::null(), core::ptr::null(), access) };
    if h.is_null() {
        return Err(WinErr::last("OpenSCManagerW"));
    }
    Ok(Sc(h))
}

/// `None` when the service does not exist.
fn service(name: &str, access: u32) -> WinResult<Option<Sc>> {
    let scm = manager(SC_MANAGER_CONNECT)?;
    let name_w = wide(name);
    // SAFETY: `scm` is open; `name_w` is NUL-terminated.
    let h = unsafe { OpenServiceW(scm.0, name_w.as_ptr(), access) };
    if h.is_null() {
        let err = WinErr::last("OpenServiceW");
        return if err.code == ERROR_SERVICE_DOES_NOT_EXIST {
            Ok(None)
        } else {
            Err(err)
        };
    }
    Ok(Some(Sc(h)))
}

pub(crate) fn state_name(state: u32) -> &'static str {
    match state {
        1 => "stopped",
        2 => "start-pending",
        3 => "stop-pending",
        4 => "running",
        5 => "continue-pending",
        6 => "pause-pending",
        7 => "paused",
        _ => "unknown",
    }
}

fn start_type_name(start: u32) -> &'static str {
    match start {
        0 => "boot",
        1 => "system",
        2 => "auto",
        3 => "manual",
        4 => "disabled",
        _ => "unknown",
    }
}

fn type_name(ty: u32) -> &'static str {
    if ty & 0x1 != 0 {
        "kernel-driver"
    } else if ty & 0x2 != 0 {
        "file-system-driver"
    } else if ty & 0x10 != 0 {
        "own-process"
    } else if ty & 0x20 != 0 {
        "share-process"
    } else {
        "other"
    }
}

/// `[{"name","displayName","state","type","pid"}…]` for every service of `kind`
/// (`SERVICE_WIN32` or `SERVICE_DRIVER`).
pub(crate) fn list(kind: u32) -> WinResult<String> {
    let scm = manager(SC_MANAGER_CONNECT | SC_MANAGER_ENUMERATE_SERVICE)?;
    // `u64` storage keeps the pointer-bearing records aligned.
    let mut buf: Vec<u64> = vec![0; 64 * 1024 / 8];
    let mut resume = 0u32;
    let mut j = Json::new();
    j.begin_array();
    loop {
        let mut needed = 0u32;
        let mut returned = 0u32;
        // SAFETY: `buf` is valid for its byte length; `resume` continues a partial listing.
        let ok = unsafe {
            EnumServicesStatusExW(
                scm.0,
                SC_ENUM_PROCESS_INFO,
                kind,
                SERVICE_STATE_ALL,
                buf.as_mut_ptr().cast(),
                (buf.len() * 8) as u32,
                &mut needed,
                &mut returned,
                &mut resume,
                core::ptr::null(),
            )
        };
        let more = if ok != 0 {
            false
        } else {
            let err = WinErr::last("EnumServicesStatusExW");
            if err.code != super::ERROR_MORE_DATA {
                return Err(err);
            }
            true
        };
        let records = buf.as_ptr().cast::<ENUM_SERVICE_STATUS_PROCESSW>();
        for i in 0..returned as usize {
            // SAFETY: the API wrote `returned` records at the start of `buf`; their strings
            // point into `buf` as well.
            let rec = unsafe { &*records.add(i) };
            let status = rec.ServiceStatusProcess;
            j.begin_object();
            // SAFETY: NUL-terminated strings inside `buf`.
            j.field_str("name", &unsafe { from_pwstr(rec.lpServiceName) });
            j.field_str("displayName", &unsafe { from_pwstr(rec.lpDisplayName) });
            j.field_str("state", state_name(status.dwCurrentState));
            j.field_str("type", type_name(status.dwServiceType));
            j.field_num("pid", status.dwProcessId as f64);
            j.end_object();
        }
        if !more {
            break;
        }
        if returned == 0 && (needed as usize) > buf.len() * 8 {
            buf.resize((needed as usize).div_ceil(8), 0);
        }
    }
    j.end_array();
    Ok(j.finish())
}

/// Full status and configuration of one service; `None` when it does not exist.
pub(crate) fn query(name: &str) -> WinResult<Option<String>> {
    let Some(svc) = service(name, SERVICE_QUERY_STATUS | SERVICE_QUERY_CONFIG)? else {
        return Ok(None);
    };
    let mut status = SERVICE_STATUS_PROCESS::default();
    let mut needed = 0u32;
    // SAFETY: `status` is a `SERVICE_STATUS_PROCESS` of the size passed.
    let ok = unsafe {
        QueryServiceStatusEx(
            svc.0,
            SC_STATUS_PROCESS_INFO,
            (&raw mut status).cast(),
            size_of::<SERVICE_STATUS_PROCESS>() as u32,
            &mut needed,
        )
    };
    if ok == 0 {
        return Err(WinErr::last("QueryServiceStatusEx"));
    }
    let mut cfg: Vec<u64> = vec![0; 8 * 1024 / 8];
    loop {
        // SAFETY: `cfg` is valid for its byte length.
        let ok = unsafe {
            QueryServiceConfigW(
                svc.0,
                cfg.as_mut_ptr().cast(),
                (cfg.len() * 8) as u32,
                &mut needed,
            )
        };
        if ok != 0 {
            break;
        }
        let err = WinErr::last("QueryServiceConfigW");
        if err.code != super::ERROR_INSUFFICIENT_BUFFER {
            return Err(err);
        }
        cfg.resize((needed as usize).div_ceil(8), 0);
    }
    // SAFETY: the API filled a `QUERY_SERVICE_CONFIGW` whose strings point into `cfg`.
    let config = unsafe { &*cfg.as_ptr().cast::<QUERY_SERVICE_CONFIGW>() };
    let mut j = Json::new();
    j.begin_object();
    j.field_str("name", name);
    // SAFETY: NUL-terminated strings inside `cfg`.
    unsafe {
        j.field_str("displayName", &from_pwstr(config.lpDisplayName));
        j.field_str("state", state_name(status.dwCurrentState));
        j.field_str("type", type_name(status.dwServiceType));
        j.field_num("pid", status.dwProcessId as f64);
        j.field_str("startType", start_type_name(config.dwStartType));
        j.field_str("binaryPath", &from_pwstr(config.lpBinaryPathName));
        j.field_str("account", &from_pwstr(config.lpServiceStartName));
        j.field_num("exitCode", status.dwWin32ExitCode as f64);
        j.key("dependencies").begin_array();
        // `lpDependencies` is a double-NUL-terminated list.
        let mut p = config.lpDependencies;
        if !p.is_null() {
            while *p != 0 {
                let dep = from_pwstr(p);
                p = p.add(dep.encode_utf16().count() + 1);
                j.str(&dep);
            }
        }
        j.end_array();
    }
    j.end_object();
    Ok(Some(j.finish()))
}

/// Asks the SCM to start the service. Already running is not an error.
pub(crate) fn start(name: &str) -> WinResult<()> {
    let Some(svc) = service(name, SERVICE_START)? else {
        return Err(WinErr {
            code: ERROR_SERVICE_DOES_NOT_EXIST,
            call: "OpenServiceW",
        });
    };
    // SAFETY: no arguments are passed.
    if unsafe { StartServiceW(svc.0, 0, core::ptr::null()) } == 0 {
        let err = WinErr::last("StartServiceW");
        if err.code != ERROR_SERVICE_ALREADY_RUNNING {
            return Err(err);
        }
    }
    Ok(())
}

/// Sends `SERVICE_CONTROL_STOP`. Already stopped is not an error.
pub(crate) fn stop(name: &str) -> WinResult<()> {
    let Some(svc) = service(name, SERVICE_STOP)? else {
        return Err(WinErr {
            code: ERROR_SERVICE_DOES_NOT_EXIST,
            call: "OpenServiceW",
        });
    };
    let mut status = SERVICE_STATUS::default();
    // SAFETY: `status` receives the last reported status.
    if unsafe { ControlService(svc.0, SERVICE_CONTROL_STOP, &mut status) } == 0 {
        let err = WinErr::last("ControlService");
        if err.code != ERROR_SERVICE_NOT_ACTIVE {
            return Err(err);
        }
    }
    Ok(())
}
