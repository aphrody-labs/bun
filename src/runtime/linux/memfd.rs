//! `memfd_create(2)`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// `memfdCreate(name, flags)` returns the new file descriptor.
#[bun_jsc::host_fn]
pub(crate) fn js_memfd_create(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let name = super::cstr_arg(global, frame, 0)?;
        let flags = super::int_arg(frame, 1) as libc::c_long;
        // SAFETY: `name` is NUL-terminated and outlives the call.
        let rc = unsafe { libc::syscall(super::nr::MEMFD_CREATE, name.as_ptr(), flags) };
        let fd = super::check(global, rc, "memfd_create", None)?;
        Ok(JSValue::js_number_from_int32(fd as i32))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
