//! perf_event: hardware/software counters and sampling (`perf_event_open(2)`).
//!
//! The JS layer encodes `struct perf_event_attr` (`perfEvent.open()` in
//! `linux.ts`); counters are read from the returned fd with `node:fs`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
const PERF_FLAG_FD_CLOEXEC: libc::c_long = 1 << 3;
/// `PERF_ATTR_SIZE_VER0`, the smallest attribute the kernel accepts.
#[cfg(target_os = "linux")]
const PERF_ATTR_SIZE_VER0: usize = 64;

/// `perfEventOpen(attr, pid, cpu, groupFd, flags)` returns the event fd (close-on-exec).
#[bun_jsc::host_fn]
pub(crate) fn js_perf_event_open(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let Some(buffer) = frame.argument(0).as_array_buffer(global) else {
            return Err(global.throw_invalid_arguments(format_args!(
                "attr must be an ArrayBufferView of struct perf_event_attr"
            )));
        };
        let attr = buffer.slice();
        if attr.len() < PERF_ATTR_SIZE_VER0 {
            return Err(global.throw_invalid_arguments(format_args!(
                "attr must be at least {PERF_ATTR_SIZE_VER0} bytes"
            )));
        }
        // The kernel reads `attr.size` bytes, so a copy guarantees alignment and length.
        let mut copy = attr.to_vec();
        let size = u32::try_from(copy.len()).unwrap_or(u32::MAX);
        copy[4..8].copy_from_slice(&size.to_ne_bytes());

        let pid = super::int_arg(frame, 1) as libc::c_long;
        let cpu = super::int_arg(frame, 2) as libc::c_long;
        let group_fd = super::int_arg(frame, 3) as libc::c_long;
        let flags = super::int_arg(frame, 4) as libc::c_long | PERF_FLAG_FD_CLOEXEC;
        // SAFETY: `copy` holds `size` bytes of `struct perf_event_attr`, valid for the call.
        let rc = unsafe {
            libc::syscall(
                super::nr::PERF_EVENT_OPEN,
                copy.as_ptr(),
                pid,
                cpu,
                group_fd,
                flags,
            )
        };
        let fd = super::check(global, rc, "perf_event_open", None)?;
        Ok(JSValue::js_number_from_int64(fd as i64))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `PERF_EVENT_IOC_ENABLE`, `DISABLE`, `REFRESH`, `RESET` and `SET_OUTPUT`: the
/// requests whose argument is an integer, not a pointer.
#[cfg(target_os = "linux")]
const INTEGER_REQUESTS: [u32; 5] = [0x2400, 0x2401, 0x2402, 0x2403, 0x2405];

/// `perfEventIoctl(fd, request, arg)` for the integer-argument `PERF_EVENT_IOC_*` requests.
#[bun_jsc::host_fn]
pub(crate) fn js_perf_event_ioctl(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let fd = super::int_arg(frame, 0) as libc::c_int;
        let request = super::int_arg(frame, 1) as u32;
        if !INTEGER_REQUESTS.contains(&request) {
            return Err(global.throw_invalid_arguments(format_args!(
                "request must be PERF_EVENT_IOC_ENABLE, DISABLE, REFRESH, RESET or SET_OUTPUT"
            )));
        }
        let arg = super::int_arg(frame, 2) as libc::c_ulong;
        // SAFETY: the integer `PERF_EVENT_IOC_*` requests take no pointer.
        let rc = unsafe { libc::ioctl(fd, request as _, arg) };
        let rc = super::check(global, rc as libc::c_long, "ioctl", None)?;
        Ok(JSValue::js_number_from_int64(rc as i64))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
