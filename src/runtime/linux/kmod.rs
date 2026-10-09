//! Kernel modules: `finit_module(2)`, `init_module(2)` and `delete_module(2)`.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

/// `finitModule(path | null, fd, params | null, flags)`
///
/// With a `path` the file is opened here and closed afterwards; otherwise `fd` is used.
#[bun_jsc::host_fn]
pub(crate) fn js_finit_module(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let path = super::opt_cstr_arg(global, frame, 0)?;
        let mut fd = super::int_arg(frame, 1) as libc::c_int;
        let params = super::opt_cstr_arg(global, frame, 2)?;
        let flags = super::int_arg(frame, 3) as libc::c_long;

        let mut opened = false;
        if let Some(path) = &path {
            // SAFETY: `path` is NUL-terminated.
            fd = unsafe { libc::open(path.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC) };
            if fd < 0 {
                return Err(super::errno_error(
                    global,
                    bun_sys::last_errno(),
                    "open",
                    Some(path.to_bytes()),
                ));
            }
            opened = true;
        }

        let empty = c"";
        let params_ptr = params.as_ref().map_or(empty.as_ptr(), |p| p.as_ptr());
        // SAFETY: `params_ptr` is a NUL-terminated string that outlives the call.
        let rc = unsafe {
            libc::syscall(
                super::nr::FINIT_MODULE,
                fd as libc::c_long,
                params_ptr,
                flags,
            )
        };
        let errno = bun_sys::last_errno();
        if opened {
            // SAFETY: `fd` was opened above and is closed once.
            unsafe { libc::close(fd) };
        }
        if rc < 0 {
            return Err(super::errno_error(
                global,
                errno,
                "finit_module",
                path.as_ref().map(|p| p.to_bytes()),
            ));
        }
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `initModule(image, params | null)`
#[bun_jsc::host_fn]
pub(crate) fn js_init_module(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let Some(buffer) = frame.argument(0).as_array_buffer(global) else {
            return Err(global.throw_invalid_arguments(format_args!(
                "image must be an ArrayBufferView"
            )));
        };
        let image = buffer.slice();
        let params = super::opt_cstr_arg(global, frame, 1)?;
        let empty = c"";
        let params_ptr = params.as_ref().map_or(empty.as_ptr(), |p| p.as_ptr());
        // SAFETY: `image` is valid for `image.len()` bytes and `params_ptr` is NUL-terminated;
        // both outlive the call.
        let rc = unsafe {
            libc::syscall(
                super::nr::INIT_MODULE,
                image.as_ptr(),
                image.len() as libc::c_ulong,
                params_ptr,
            )
        };
        super::check(global, rc, "init_module", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

/// `deleteModule(name, flags)`
#[bun_jsc::host_fn]
pub(crate) fn js_delete_module(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let name = super::cstr_arg(global, frame, 0)?;
        let flags = super::int_arg(frame, 1) as libc::c_long;
        // SAFETY: `name` is NUL-terminated and outlives the call.
        let rc = unsafe { libc::syscall(super::nr::DELETE_MODULE, name.as_ptr(), flags) };
        super::check(global, rc, "delete_module", Some(name.to_bytes()))?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
