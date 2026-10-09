//! `mount(2)`, `umount2(2)` and `pivot_root(2)`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// `mount(source | null, target, fstype | null, flags, data | null)`
#[bun_jsc::host_fn]
pub(crate) fn js_mount(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let source = super::opt_cstr_arg(global, frame, 0)?;
        let target = super::cstr_arg(global, frame, 1)?;
        let fstype = super::opt_cstr_arg(global, frame, 2)?;
        let flags = super::int_arg(frame, 3) as libc::c_ulong;
        let data = super::opt_cstr_arg(global, frame, 4)?;

        let ptr_or_null = |s: &Option<std::ffi::CString>| -> *const libc::c_char {
            s.as_ref().map_or(core::ptr::null(), |c| c.as_ptr())
        };
        // SAFETY: every pointer is null or a NUL-terminated string that outlives the call.
        let rc = unsafe {
            libc::syscall(
                super::nr::MOUNT,
                ptr_or_null(&source),
                target.as_ptr(),
                ptr_or_null(&fstype),
                flags,
                ptr_or_null(&data),
            )
        };
        super::check(global, rc, "mount", Some(target.to_bytes()))?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `umount2(target, flags)`
#[bun_jsc::host_fn]
pub(crate) fn js_umount(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let target = super::cstr_arg(global, frame, 0)?;
        let flags = super::int_arg(frame, 1) as libc::c_long;
        // SAFETY: `target` is NUL-terminated and outlives the call.
        let rc = unsafe { libc::syscall(super::nr::UMOUNT2, target.as_ptr(), flags) };
        super::check(global, rc, "umount2", Some(target.to_bytes()))?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `pivot_root(newRoot, putOld)`
#[bun_jsc::host_fn]
pub(crate) fn js_pivot_root(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let new_root = super::cstr_arg(global, frame, 0)?;
        let put_old = super::cstr_arg(global, frame, 1)?;
        // SAFETY: both strings are NUL-terminated and outlive the call.
        let rc = unsafe {
            libc::syscall(
                super::nr::PIVOT_ROOT,
                new_root.as_ptr(),
                put_old.as_ptr(),
            )
        };
        super::check(global, rc, "pivot_root", Some(new_root.to_bytes()))?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
