//! `unshare(2)` and `setns(2)`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// `unshare(flags)`
#[bun_jsc::host_fn]
pub(crate) fn js_unshare(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let flags = super::int_arg(frame, 0);
        // SAFETY: `unshare` takes one integer and touches no user memory.
        let rc = unsafe { libc::syscall(super::nr::UNSHARE, flags as libc::c_long) };
        super::check(global, rc, "unshare", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `setns(fd, nstype)`
#[bun_jsc::host_fn]
pub(crate) fn js_setns(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let fd = super::int_arg(frame, 0);
        let nstype = super::int_arg(frame, 1);
        // SAFETY: `setns` takes two integers and touches no user memory.
        let rc = unsafe {
            libc::syscall(
                super::nr::SETNS,
                fd as libc::c_long,
                nstype as libc::c_long,
            )
        };
        super::check(global, rc, "setns", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
