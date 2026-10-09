//! Job Objects. JS holds an id; the handles stay in this module so a stale or forged id
//! can never close an unrelated handle of the process.

use super::{BOOL, HANDLE, Json, OwnedHandle, WinErr, WinResult, process};
use core::ffi::c_void;
use std::collections::HashMap;
use std::sync::Mutex;

const PROCESS_SET_QUOTA: u32 = 0x0100;
const PROCESS_TERMINATE: u32 = 0x0001;

const BASIC_ACCOUNTING_INFORMATION: i32 = 1;
const BASIC_PROCESS_ID_LIST: i32 = 3;
const EXTENDED_LIMIT_INFORMATION: i32 = 9;
const CPU_RATE_CONTROL_INFORMATION: i32 = 15;

const LIMIT_ACTIVE_PROCESS: u32 = 0x0000_0008;
const LIMIT_PROCESS_MEMORY: u32 = 0x0000_0100;
const LIMIT_JOB_MEMORY: u32 = 0x0000_0200;
const LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
const CPU_RATE_CONTROL_ENABLE: u32 = 0x1;
const CPU_RATE_CONTROL_HARD_CAP: u32 = 0x4;
/// `ERROR_INVALID_HANDLE`, reported for an unknown job id.
const ERROR_INVALID_HANDLE: u32 = 6;

#[repr(C)]
#[derive(Default)]
struct BasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[repr(C)]
#[derive(Default)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[repr(C)]
#[derive(Default)]
struct ExtendedLimitInformation {
    basic: BasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[repr(C)]
#[derive(Default)]
struct CpuRateControlInformation {
    control_flags: u32,
    cpu_rate: u32,
}

#[repr(C)]
#[derive(Default)]
struct BasicAccountingInformation {
    total_user_time: i64,
    total_kernel_time: i64,
    this_period_total_user_time: i64,
    this_period_total_kernel_time: i64,
    total_page_fault_count: u32,
    total_processes: u32,
    active_processes: u32,
    total_terminated_processes: u32,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateJobObjectW(security: *const c_void, name: *const u16) -> HANDLE;
    fn SetInformationJobObject(job: HANDLE, class: i32, info: *const c_void, len: u32) -> BOOL;
    fn QueryInformationJobObject(
        job: HANDLE,
        class: i32,
        info: *mut c_void,
        len: u32,
        ret: *mut u32,
    ) -> BOOL;
    fn AssignProcessToJobObject(job: HANDLE, process: HANDLE) -> BOOL;
    fn TerminateJobObject(job: HANDLE, exit_code: u32) -> BOOL;
}

struct Registry {
    next: u32,
    jobs: HashMap<u32, usize>,
}

static JOBS: Mutex<Option<Registry>> = Mutex::new(None);

fn with_job<T>(id: u32, f: impl FnOnce(HANDLE) -> WinResult<T>) -> WinResult<T> {
    let handle = {
        let guard = JOBS.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_ref().and_then(|r| r.jobs.get(&id).copied())
    };
    match handle {
        Some(h) => f(h as HANDLE),
        None => Err(WinErr {
            code: ERROR_INVALID_HANDLE,
            call: "JobObject",
        }),
    }
}

/// Creates a job (named when `name` is given) and returns its id.
pub(crate) fn create(name: Option<&str>) -> WinResult<u32> {
    let name_w = name.map(super::wide);
    // SAFETY: default security; the name is NUL-terminated or null.
    let h = unsafe {
        CreateJobObjectW(
            core::ptr::null(),
            name_w.as_ref().map_or(core::ptr::null(), |n| n.as_ptr()),
        )
    };
    if h.is_null() {
        return Err(WinErr::last("CreateJobObjectW"));
    }
    let mut guard = JOBS.lock().unwrap_or_else(|e| e.into_inner());
    let registry = guard.get_or_insert_with(|| Registry {
        next: 1,
        jobs: HashMap::new(),
    });
    let id = registry.next;
    registry.next += 1;
    registry.jobs.insert(id, h as usize);
    Ok(id)
}

/// Closes the job handle. With kill-on-close set, this terminates its processes.
pub(crate) fn close(id: u32) -> bool {
    let handle = {
        let mut guard = JOBS.lock().unwrap_or_else(|e| e.into_inner());
        guard.as_mut().and_then(|r| r.jobs.remove(&id))
    };
    match handle {
        Some(h) => {
            drop(OwnedHandle(h as HANDLE));
            true
        }
        None => false,
    }
}

/// Limits applied by [`set_limits`]; `None` leaves that limit off.
pub(crate) struct Limits {
    pub kill_on_close: bool,
    pub process_memory: Option<u64>,
    pub job_memory: Option<u64>,
    pub active_processes: Option<u32>,
    /// Hard CPU cap in percent of the whole machine, `0 < rate <= 100`.
    pub cpu_rate: Option<f64>,
}

pub(crate) fn set_limits(id: u32, limits: &Limits) -> WinResult<()> {
    with_job(id, |h| {
        let mut info = ExtendedLimitInformation::default();
        if limits.kill_on_close {
            info.basic.limit_flags |= LIMIT_KILL_ON_JOB_CLOSE;
        }
        if let Some(bytes) = limits.process_memory {
            info.basic.limit_flags |= LIMIT_PROCESS_MEMORY;
            info.process_memory_limit = bytes as usize;
        }
        if let Some(bytes) = limits.job_memory {
            info.basic.limit_flags |= LIMIT_JOB_MEMORY;
            info.job_memory_limit = bytes as usize;
        }
        if let Some(n) = limits.active_processes {
            info.basic.limit_flags |= LIMIT_ACTIVE_PROCESS;
            info.basic.active_process_limit = n;
        }
        // SAFETY: `info` is the documented struct for this class.
        let ok = unsafe {
            SetInformationJobObject(
                h,
                EXTENDED_LIMIT_INFORMATION,
                (&raw const info).cast(),
                core::mem::size_of::<ExtendedLimitInformation>() as u32,
            )
        };
        if ok == 0 {
            return Err(WinErr::last("SetInformationJobObject"));
        }
        if let Some(rate) = limits.cpu_rate {
            let cpu = CpuRateControlInformation {
                control_flags: CPU_RATE_CONTROL_ENABLE | CPU_RATE_CONTROL_HARD_CAP,
                cpu_rate: ((rate * 100.0).round() as u32).clamp(1, 10_000),
            };
            // SAFETY: `cpu` is the documented struct for this class.
            let ok = unsafe {
                SetInformationJobObject(
                    h,
                    CPU_RATE_CONTROL_INFORMATION,
                    (&raw const cpu).cast(),
                    core::mem::size_of::<CpuRateControlInformation>() as u32,
                )
            };
            if ok == 0 {
                return Err(WinErr::last("SetInformationJobObject"));
            }
        }
        Ok(())
    })
}

pub(crate) fn assign(id: u32, pid: u32) -> WinResult<()> {
    with_job(id, |h| {
        let process = process::open(pid, PROCESS_SET_QUOTA | PROCESS_TERMINATE)?;
        // SAFETY: both handles are open with the required rights.
        if unsafe { AssignProcessToJobObject(h, process.0) } == 0 {
            return Err(WinErr::last("AssignProcessToJobObject"));
        }
        Ok(())
    })
}

pub(crate) fn terminate(id: u32, exit_code: u32) -> WinResult<()> {
    with_job(id, |h| {
        // SAFETY: `h` is an open job handle.
        if unsafe { TerminateJobObject(h, exit_code) } == 0 {
            return Err(WinErr::last("TerminateJobObject"));
        }
        Ok(())
    })
}

/// `{ activeProcesses, totalProcesses, terminatedProcesses, userTime, kernelTime, pids,
/// peakProcessMemory, peakJobMemory }`. Times are in milliseconds.
pub(crate) fn info_json(id: u32) -> WinResult<String> {
    with_job(id, |h| {
        let mut acct = BasicAccountingInformation::default();
        // SAFETY: `acct` is the documented struct for this class.
        let ok = unsafe {
            QueryInformationJobObject(
                h,
                BASIC_ACCOUNTING_INFORMATION,
                (&raw mut acct).cast(),
                core::mem::size_of::<BasicAccountingInformation>() as u32,
                core::ptr::null_mut(),
            )
        };
        if ok == 0 {
            return Err(WinErr::last("QueryInformationJobObject"));
        }
        let mut ext = ExtendedLimitInformation::default();
        // SAFETY: as above.
        let ok = unsafe {
            QueryInformationJobObject(
                h,
                EXTENDED_LIMIT_INFORMATION,
                (&raw mut ext).cast(),
                core::mem::size_of::<ExtendedLimitInformation>() as u32,
                core::ptr::null_mut(),
            )
        };
        if ok == 0 {
            return Err(WinErr::last("QueryInformationJobObject"));
        }
        // JOBOBJECT_BASIC_PROCESS_ID_LIST: two u32 counts, then ULONG_PTR ids.
        let capacity = (acct.active_processes as usize).max(1) + 16;
        let mut list = vec![0usize; 1 + capacity];
        let header = list.as_mut_ptr().cast::<u32>();
        // SAFETY: the first usize holds the two u32 counts.
        unsafe { *header = capacity as u32 };
        // SAFETY: `list` is valid for its byte length.
        let ok = unsafe {
            QueryInformationJobObject(
                h,
                BASIC_PROCESS_ID_LIST,
                list.as_mut_ptr().cast(),
                (list.len() * core::mem::size_of::<usize>()) as u32,
                core::ptr::null_mut(),
            )
        };
        let mut j = Json::new();
        j.begin_object()
            .field_num("activeProcesses", acct.active_processes as f64)
            .field_num("totalProcesses", acct.total_processes as f64)
            .field_num(
                "terminatedProcesses",
                acct.total_terminated_processes as f64,
            )
            .field_num("userTime", acct.total_user_time as f64 / 10_000.0)
            .field_num("kernelTime", acct.total_kernel_time as f64 / 10_000.0)
            .field_num("peakProcessMemory", ext.peak_process_memory_used as f64)
            .field_num("peakJobMemory", ext.peak_job_memory_used as f64)
            .key("pids")
            .begin_array();
        if ok != 0 {
            // SAFETY: the second u32 is NumberOfProcessIdsInList.
            let count = (unsafe { *header.add(1) } as usize).min(capacity);
            for &pid in &list[1..1 + count] {
                j.num(pid as f64);
            }
        }
        j.end_array().end_object();
        Ok(j.finish())
    })
}
