//! Process snapshot (Toolhelp), image path and termination.

use super::{BOOL, HANDLE, Json, OwnedHandle, WinErr, WinResult};

const TH32CS_SNAPPROCESS: u32 = 0x2;
const PROCESS_TERMINATE: u32 = 0x0001;
const PROCESS_SET_QUOTA: u32 = 0x0100;
const PROCESS_SET_INFORMATION: u32 = 0x0200;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const INVALID_HANDLE_VALUE: HANDLE = -1isize as HANDLE;

#[repr(C)]
struct ProcessEntry32W {
    size: u32,
    usage: u32,
    pid: u32,
    default_heap_id: usize,
    module_id: u32,
    threads: u32,
    parent_pid: u32,
    pri_class_base: i32,
    flags: u32,
    exe_file: [u16; 260],
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> HANDLE;
    fn Process32FirstW(snapshot: HANDLE, entry: *mut ProcessEntry32W) -> BOOL;
    fn Process32NextW(snapshot: HANDLE, entry: *mut ProcessEntry32W) -> BOOL;
    pub(crate) fn OpenProcess(access: u32, inherit: BOOL, pid: u32) -> HANDLE;
    fn TerminateProcess(process: HANDLE, exit_code: u32) -> BOOL;
    fn SetProcessAffinityMask(process: HANDLE, mask: usize) -> BOOL;
    fn SetPriorityClass(process: HANDLE, priority_class: u32) -> BOOL;
    fn SetProcessInformation(
        process: HANDLE,
        information_class: u32,
        information: *const core::ffi::c_void,
        size: u32,
    ) -> BOOL;
    fn SetProcessWorkingSetSize(process: HANDLE, minimum: usize, maximum: usize) -> BOOL;
    fn QueryFullProcessImageNameW(
        process: HANDLE,
        flags: u32,
        name: *mut u16,
        len: *mut u32,
    ) -> BOOL;
}

/// `[{ pid, ppid, name, threads }]` for every process.
pub(crate) fn list_json() -> WinResult<String> {
    // SAFETY: no preconditions.
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(WinErr::last("CreateToolhelp32Snapshot"));
    }
    let snapshot = OwnedHandle(snapshot);
    let mut entry = ProcessEntry32W {
        size: core::mem::size_of::<ProcessEntry32W>() as u32,
        usage: 0,
        pid: 0,
        default_heap_id: 0,
        module_id: 0,
        threads: 0,
        parent_pid: 0,
        pri_class_base: 0,
        flags: 0,
        exe_file: [0; 260],
    };
    let mut j = Json::new();
    j.begin_array();
    // SAFETY: `entry.size` is set; the snapshot is open.
    let mut ok = unsafe { Process32FirstW(snapshot.0, &raw mut entry) };
    while ok != 0 {
        j.begin_object()
            .field_num("pid", entry.pid as f64)
            .field_num("ppid", entry.parent_pid as f64)
            .field_str("name", &super::from_wide(&entry.exe_file))
            .field_num("threads", entry.threads as f64)
            .end_object();
        // SAFETY: as above.
        ok = unsafe { Process32NextW(snapshot.0, &raw mut entry) };
    }
    j.end_array();
    Ok(j.finish())
}

/// Opens `pid` with `access`.
pub(crate) fn open(pid: u32, access: u32) -> WinResult<OwnedHandle> {
    // SAFETY: no preconditions.
    let h = unsafe { OpenProcess(access, 0, pid) };
    if h.is_null() {
        return Err(WinErr::last("OpenProcess"));
    }
    Ok(OwnedHandle(h))
}

/// Full Win32 path of the executable of `pid`.
pub(crate) fn image_path(pid: u32) -> WinResult<String> {
    let h = open(pid, PROCESS_QUERY_LIMITED_INFORMATION)?;
    let mut buf = vec![0u16; 32768];
    let mut len = buf.len() as u32;
    // SAFETY: `buf` is valid for `len` units.
    if unsafe { QueryFullProcessImageNameW(h.0, 0, buf.as_mut_ptr(), &raw mut len) } == 0 {
        return Err(WinErr::last("QueryFullProcessImageNameW"));
    }
    Ok(String::from_utf16_lossy(&buf[..len as usize]))
}

/// `TerminateProcess(pid, exit_code)`.
pub(crate) fn terminate(pid: u32, exit_code: u32) -> WinResult<()> {
    let h = open(pid, PROCESS_TERMINATE)?;
    // SAFETY: `h` was opened with PROCESS_TERMINATE.
    if unsafe { TerminateProcess(h.0, exit_code) } == 0 {
        return Err(WinErr::last("TerminateProcess"));
    }
    Ok(())
}

/// Sets the processor affinity mask for the process in its current processor group.
pub(crate) fn set_affinity(pid: u32, mask: usize) -> WinResult<()> {
    let h = open(
        pid,
        PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION,
    )?;
    // SAFETY: `h` has process-information access and `mask` is a processor affinity mask.
    if unsafe { SetProcessAffinityMask(h.0, mask) } == 0 {
        return Err(WinErr::last("SetProcessAffinityMask"));
    }
    Ok(())
}

/// Sets one of the documented Win32 process priority classes.
pub(crate) fn set_priority(pid: u32, priority_class: u32) -> WinResult<()> {
    let h = open(pid, PROCESS_SET_INFORMATION)?;
    // SAFETY: `h` was opened with PROCESS_SET_INFORMATION.
    if unsafe { SetPriorityClass(h.0, priority_class) } == 0 {
        return Err(WinErr::last("SetPriorityClass"));
    }
    Ok(())
}

#[repr(C)]
struct ProcessPowerThrottlingState {
    version: u32,
    control_mask: u32,
    state_mask: u32,
}

/// Enables or disables Windows process power throttling.
pub(crate) fn set_eco_mode(pid: u32, enabled: bool) -> WinResult<()> {
    const PROCESS_POWER_THROTTLING: u32 = 4;
    const PROCESS_POWER_THROTTLING_CURRENT_VERSION: u32 = 1;
    const PROCESS_POWER_THROTTLING_EXECUTION_SPEED: u32 = 1;

    let h = open(pid, PROCESS_SET_INFORMATION)?;
    let state = ProcessPowerThrottlingState {
        version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        control_mask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        state_mask: if enabled {
            PROCESS_POWER_THROTTLING_EXECUTION_SPEED
        } else {
            0
        },
    };
    // SAFETY: `state` matches PROCESS_POWER_THROTTLING_STATE's documented layout and size.
    if unsafe {
        SetProcessInformation(
            h.0,
            PROCESS_POWER_THROTTLING,
            (&raw const state).cast(),
            core::mem::size_of::<ProcessPowerThrottlingState>() as u32,
        )
    } == 0
    {
        return Err(WinErr::last("SetProcessInformation"));
    }
    Ok(())
}

/// Requests that Windows trim a process's working set.
pub(crate) fn trim_working_set(pid: u32) -> WinResult<()> {
    let h = open(pid, PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION)?;
    // SAFETY: -1 requests the system to choose both working-set bounds.
    if unsafe { SetProcessWorkingSetSize(h.0, usize::MAX, usize::MAX) } == 0 {
        return Err(WinErr::last("SetProcessWorkingSetSize"));
    }
    Ok(())
}
