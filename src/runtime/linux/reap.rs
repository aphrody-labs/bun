//! Reaping orphans when Bun runs as PID 1 or as a child subreaper.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// `reapZombie(pid)` collects one exited child with `waitpid(pid, WNOHANG)`.
/// Returns the raw wait status, or `null` while the child is still running.
#[bun_jsc::host_fn]
pub(crate) fn js_reap_zombie(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let pid = super::int_arg(frame, 0) as libc::pid_t;
        if pid <= 0 {
            return Err(
                global.throw_invalid_arguments(format_args!("pid must name one child process"))
            );
        }
        let mut status: libc::c_int = 0;
        loop {
            // SAFETY: `status` is a valid out-pointer; `pid` names a single process.
            let rc = unsafe { libc::waitpid(pid, &raw mut status, libc::WNOHANG) };
            if rc < 0 && bun_sys::last_errno() == libc::EINTR {
                continue;
            }
            let rc = super::check(global, rc as libc::c_long, "waitpid", None)?;
            return Ok(if rc == 0 {
                JSValue::NULL
            } else {
                JSValue::js_number_from_int32(status)
            });
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
