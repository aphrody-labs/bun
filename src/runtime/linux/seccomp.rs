//! seccomp: syscall filtering with classic BPF programs (`seccomp(2)`, Linux 3.17+).
//!
//! The JS layer assembles the program (`seccomp.filter()` in `linux.ts`); this
//! file only installs it, so any `struct sock_filter` array works.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
const SECCOMP_SET_MODE_FILTER: libc::c_long = 1;
#[cfg(target_os = "linux")]
const SECCOMP_GET_ACTION_AVAIL: libc::c_long = 2;
#[cfg(target_os = "linux")]
const PR_SET_NO_NEW_PRIVS: libc::c_long = 38;
/// `struct sock_filter` is `{ u16 code; u8 jt; u8 jf; u32 k; }`.
#[cfg(target_os = "linux")]
const SOCK_FILTER_SIZE: usize = 8;
/// `BPF_MAXINSNS`
#[cfg(target_os = "linux")]
const MAX_INSNS: usize = 4096;

/// `struct sock_fprog`
#[cfg(target_os = "linux")]
#[repr(C)]
struct SockFprog {
    len: u16,
    filter: *const u8,
}

/// `seccompSetFilter(program, flags)` installs a filter on the calling thread
/// (every thread with `SECCOMP_FILTER_FLAG_TSYNC`) after setting
/// `no_new_privs`. Returns the syscall's result: a listener fd with
/// `SECCOMP_FILTER_FLAG_NEW_LISTENER`, otherwise 0.
#[bun_jsc::host_fn]
pub(crate) fn js_seccomp_set_filter(
    global: &JSGlobalObject,
    frame: &CallFrame,
) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let Some(buffer) = frame.argument(0).as_array_buffer(global) else {
            return Err(global.throw_invalid_arguments(format_args!(
                "program must be an ArrayBufferView of struct sock_filter"
            )));
        };
        let program = buffer.slice();
        let count = program.len() / SOCK_FILTER_SIZE;
        if program.is_empty() || program.len() % SOCK_FILTER_SIZE != 0 || count > MAX_INSNS {
            return Err(global.throw_invalid_arguments(format_args!(
                "program must hold 1 to {MAX_INSNS} instructions of {SOCK_FILTER_SIZE} bytes"
            )));
        }
        let flags = super::int_arg(frame, 1) as libc::c_long;

        // SAFETY: `PR_SET_NO_NEW_PRIVS` takes plain integers.
        let rc = unsafe {
            libc::syscall(
                super::nr::PRCTL,
                PR_SET_NO_NEW_PRIVS,
                1 as libc::c_long,
                0 as libc::c_long,
                0 as libc::c_long,
                0 as libc::c_long,
            )
        };
        super::check(global, rc, "prctl", None)?;

        let fprog = SockFprog {
            len: count as u16,
            filter: program.as_ptr(),
        };
        // SAFETY: `fprog` points at `count` complete instructions that outlive the call;
        // the kernel copies the program before returning.
        let rc = unsafe {
            libc::syscall(
                super::nr::SECCOMP,
                SECCOMP_SET_MODE_FILTER,
                flags,
                core::ptr::addr_of!(fprog),
            )
        };
        let rc = super::check(global, rc, "seccomp", None)?;
        Ok(JSValue::js_number_from_int64(rc as i64))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `seccompActionAvailable(action)` reports whether the kernel knows a `SECCOMP_RET_*` action.
#[bun_jsc::host_fn]
pub(crate) fn js_seccomp_action_available(
    global: &JSGlobalObject,
    frame: &CallFrame,
) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let _ = global;
        let action = super::int_arg(frame, 0) as u32;
        // SAFETY: the kernel reads one `u32` from the pointer.
        let rc = unsafe {
            libc::syscall(
                super::nr::SECCOMP,
                SECCOMP_GET_ACTION_AVAIL,
                0 as libc::c_long,
                core::ptr::addr_of!(action),
            )
        };
        Ok(JSValue::js_boolean(rc == 0))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
