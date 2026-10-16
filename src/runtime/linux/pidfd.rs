//! `pidfd_open(2)`, `pidfd_send_signal(2)` and `pidfd_getfd(2)`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// Duplicate the pidfd owned by Bun.spawn, without looking up a recyclable PID.
#[bun_jsc::host_fn]
pub(crate) fn js_pidfd_for_process(
    global: &JSGlobalObject,
    frame: &CallFrame,
) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        use crate::api::bun::subprocess::Subprocess;
        use bun_jsc::JsClass;
        let [value] = frame.arguments_as_array::<1>();
        let Some(pointer) = Subprocess::from_js(value) else {
            return Err(global.throw(format_args!("process must be a Bun.Subprocess")));
        };
        // SAFETY: the native class cast validates the wrapper, which keeps its Process alive throughout this call.
        let subprocess = unsafe { &*pointer };
        let Some(result) = subprocess.process.duplicate_pidfd() else {
            return Ok(JSValue::NULL);
        };
        let fd = result
            .map_err(|error| global.throw(format_args!("duplicate subprocess pidfd: {error}")))?;
        Ok(JSValue::js_number_from_int32(fd.native()))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `pidfdOpen(pid, flags)` returns the new file descriptor.
#[bun_jsc::host_fn]
pub(crate) fn js_pidfd_open(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let pid = super::int_arg(frame, 0) as libc::c_long;
        let flags = super::int_arg(frame, 1) as libc::c_long;
        // SAFETY: two integer arguments, no user memory.
        let rc = unsafe { libc::syscall(super::nr::PIDFD_OPEN, pid, flags) };
        let fd = super::check(global, rc, "pidfd_open", None)?;
        Ok(JSValue::js_number_from_int32(fd as i32))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `pidfdSendSignal(pidfd, signal, flags)`
#[bun_jsc::host_fn]
pub(crate) fn js_pidfd_send_signal(
    global: &JSGlobalObject,
    frame: &CallFrame,
) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let pidfd = super::int_arg(frame, 0) as libc::c_long;
        let signal = super::int_arg(frame, 1) as libc::c_long;
        let flags = super::int_arg(frame, 2) as libc::c_long;
        // SAFETY: a null `siginfo` is allowed and means "as if by kill(2)".
        let rc = unsafe {
            libc::syscall(
                super::nr::PIDFD_SEND_SIGNAL,
                pidfd,
                signal,
                core::ptr::null::<libc::c_void>(),
                flags,
            )
        };
        super::check(global, rc, "pidfd_send_signal", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `pidfdGetfd(pidfd, targetFd)` returns the duplicated file descriptor.
#[bun_jsc::host_fn]
pub(crate) fn js_pidfd_getfd(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let pidfd = super::int_arg(frame, 0) as libc::c_long;
        let target = super::int_arg(frame, 1) as libc::c_long;
        // SAFETY: three integer arguments, no user memory.
        let rc = unsafe { libc::syscall(super::nr::PIDFD_GETFD, pidfd, target, 0 as libc::c_long) };
        let fd = super::check(global, rc, "pidfd_getfd", None)?;
        Ok(JSValue::js_number_from_int32(fd as i32))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
