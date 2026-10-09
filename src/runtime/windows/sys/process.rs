//! Process snapshot (Toolhelp), image path and termination.

use super::{BOOL, HANDLE, Json, OwnedHandle, WinErr, WinResult};

const TH32CS_SNAPPROCESS: u32 = 0x2;
const PROCESS_TERMINATE: u32 = 0x0001;
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
    // SAFETY: plain-data struct; `size` is set before use.
    let mut entry: ProcessEntry32W = unsafe { core::mem::zeroed() };
    entry.size = core::mem::size_of::<ProcessEntry32W>() as u32;
    let mut j = Json::new();
    j.begin_array();
    // SAFETY: `entry.size` is set; the snapshot is open.
    let mut ok = unsafe { Process32FirstW(snapshot.0, &mut entry) };
    while ok != 0 {
        j.begin_object()
            .field_num("pid", entry.pid as f64)
            .field_num("ppid", entry.parent_pid as f64)
            .field_str("name", &super::from_wide(&entry.exe_file))
            .field_num("threads", entry.threads as f64)
            .end_object();
        // SAFETY: as above.
        ok = unsafe { Process32NextW(snapshot.0, &mut entry) };
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
    if unsafe { QueryFullProcessImageNameW(h.0, 0, buf.as_mut_ptr(), &mut len) } == 0 {
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
