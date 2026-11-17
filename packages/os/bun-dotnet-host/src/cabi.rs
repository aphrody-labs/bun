// SPDX-License-Identifier: MIT
//! C ABI of `include/bun_dotnet_host.h` (ABI version 1). Strings are UTF-8 in and out; strings
//! returned to the caller are released with [`bun_dotnet_string_free`]. Every export catches
//! panics; the detail of the last failure is read with [`bun_dotnet_last_error`].

use std::ffi::{CStr, CString, OsString, c_char, c_void};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::{Error, hostfxr, locate};

pub const BUN_DOTNET_OK: i32 = 0;
pub const BUN_DOTNET_ERR_ARG: i32 = -1;
pub const BUN_DOTNET_ERR_LOAD: i32 = -2;
pub const BUN_DOTNET_ERR_DOTNET: i32 = -4;
pub const BUN_DOTNET_ERR_PANIC: i32 = -5;

static LAST_ERROR: Mutex<String> = Mutex::new(String::new());

fn fail(status: i32, message: impl Into<String>) -> i32 {
    if let Ok(mut slot) = LAST_ERROR.lock() {
        *slot = message.into();
    }
    status
}

fn dotnet_error(error: Error) -> i32 {
    let status = if error.code.is_some() {
        BUN_DOTNET_ERR_DOTNET
    } else {
        BUN_DOTNET_ERR_LOAD
    };
    fail(status, error.message)
}

fn guard(body: impl FnOnce() -> i32) -> i32 {
    catch_unwind(AssertUnwindSafe(body))
        .unwrap_or_else(|_| fail(BUN_DOTNET_ERR_PANIC, "panic caught at the FFI boundary"))
}

/// # Safety
/// `ptr` is null or NUL-terminated.
unsafe fn opt_str<'a>(ptr: *const c_char) -> Result<Option<&'a str>, i32> {
    if ptr.is_null() {
        return Ok(None);
    }
    // SAFETY: caller contract.
    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .map(Some)
        .map_err(|_| fail(BUN_DOTNET_ERR_ARG, "argument is not UTF-8"))
}

/// # Safety
/// `ptr` is null or NUL-terminated.
unsafe fn req_str<'a>(ptr: *const c_char, name: &str) -> Result<&'a str, i32> {
    // SAFETY: caller contract.
    unsafe { opt_str(ptr) }?.ok_or_else(|| fail(BUN_DOTNET_ERR_ARG, format!("{name} is required")))
}

fn out_string(out: *mut *mut c_char, text: &str) {
    if !out.is_null() {
        let value = CString::new(text.replace('\0', "")).unwrap_or_default();
        // SAFETY: caller supplied a writable slot.
        unsafe { *out = value.into_raw() };
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn bun_dotnet_abi_version() -> u32 {
    1
}

/// Locates `hostfxr` (`dotnet_root` null: nethost order). Writes owned UTF-8 strings.
///
/// # Safety
/// `dotnet_root` null or NUL-terminated; outputs null or writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_dotnet_locate(
    dotnet_root: *const c_char,
    root_out: *mut *mut c_char,
    hostfxr_out: *mut *mut c_char,
) -> i32 {
    guard(|| {
        // SAFETY: caller contract.
        let root = match unsafe { opt_str(dotnet_root) } {
            Ok(root) => root.map(PathBuf::from),
            Err(status) => return status,
        };
        match locate(root.as_deref()) {
            Ok(location) => {
                out_string(root_out, &location.dotnet_root.to_string_lossy());
                out_string(hostfxr_out, &location.hostfxr.to_string_lossy());
                BUN_DOTNET_OK
            }
            Err(error) => dotnet_error(error),
        }
    })
}

/// Runs the `dotnet` muxer in this process (`argv` excludes the program name).
///
/// # Safety
/// `argv` holds `argc` NUL-terminated UTF-8 strings; `exit_code` null or writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_dotnet_main(
    argc: i32,
    argv: *const *const c_char,
    exit_code: *mut i32,
) -> i32 {
    guard(|| {
        let mut args = Vec::new();
        for i in 0..argc.max(0) as usize {
            // SAFETY: caller contract.
            match unsafe { req_str(*argv.add(i), "argv entry") } {
                Ok(arg) => args.push(OsString::from(arg)),
                Err(status) => return status,
            }
        }
        match hostfxr().and_then(|fxr| fxr.main(&args)) {
            Ok(code) => {
                if !exit_code.is_null() {
                    // SAFETY: caller contract.
                    unsafe { *exit_code = code };
                }
                BUN_DOTNET_OK
            }
            Err(error) => dotnet_error(error),
        }
    })
}

/// Starts the CLR (once per process); returns the hostfxr init status (0, 1 or 2) or an error.
///
/// # Safety
/// `runtime_config` null or NUL-terminated.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_dotnet_initialize(runtime_config: *const c_char) -> i32 {
    guard(|| {
        // SAFETY: caller contract.
        let config = match unsafe { opt_str(runtime_config) } {
            Ok(config) => config.map(PathBuf::from),
            Err(status) => return status,
        };
        match hostfxr().and_then(|fxr| fxr.runtime(config.as_deref())) {
            Ok(runtime) => runtime.init_status,
            Err(error) => dotnet_error(error),
        }
    })
}

/// Binds a static method: `delegate_type` null targets `[UnmanagedCallersOnly]`; `assembly`
/// null resolves `type_name` in the default load context.
///
/// # Safety
/// Strings null or NUL-terminated as documented; `out` writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_dotnet_function_pointer(
    assembly: *const c_char,
    type_name: *const c_char,
    method: *const c_char,
    delegate_type: *const c_char,
    out: *mut *mut c_void,
) -> i32 {
    guard(|| {
        if out.is_null() {
            return fail(BUN_DOTNET_ERR_ARG, "out is required");
        }
        // SAFETY: caller contract for every string.
        let parsed = unsafe {
            (|| {
                Ok::<_, i32>((
                    opt_str(assembly)?,
                    req_str(type_name, "type_name")?,
                    req_str(method, "method")?,
                    opt_str(delegate_type)?,
                ))
            })()
        };
        let (assembly, type_name, method, delegate_type) = match parsed {
            Ok(parsed) => parsed,
            Err(status) => return status,
        };
        let result = hostfxr().and_then(|fxr| {
            fxr.runtime(None)?.function_pointer(
                fxr,
                assembly.map(Path::new),
                type_name,
                method,
                delegate_type,
            )
        });
        match result {
            Ok(pointer) => {
                // SAFETY: checked non-null above.
                unsafe { *out = pointer };
                BUN_DOTNET_OK
            }
            Err(error) => dotnet_error(error),
        }
    })
}

/// Loads an assembly into the default load context.
///
/// # Safety
/// `assembly` NUL-terminated.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_dotnet_load_assembly(assembly: *const c_char) -> i32 {
    guard(|| {
        // SAFETY: caller contract.
        let assembly = match unsafe { req_str(assembly, "assembly") } {
            Ok(assembly) => assembly,
            Err(status) => return status,
        };
        match hostfxr().and_then(|fxr| fxr.runtime(None)?.load_assembly(fxr, Path::new(assembly))) {
            Ok(()) => BUN_DOTNET_OK,
            Err(error) => dotnet_error(error),
        }
    })
}

/// The last failure message (owned), or null when none was recorded.
#[unsafe(no_mangle)]
pub extern "C" fn bun_dotnet_last_error() -> *mut c_char {
    let message = LAST_ERROR
        .lock()
        .map(|slot| slot.clone())
        .unwrap_or_default();
    if message.is_empty() {
        return std::ptr::null_mut();
    }
    CString::new(message.replace('\0', "")).map_or(std::ptr::null_mut(), CString::into_raw)
}

/// Releases a string returned by this library.
///
/// # Safety
/// `value` null or returned by this library and not yet freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn bun_dotnet_string_free(value: *mut c_char) {
    if !value.is_null() {
        // SAFETY: caller contract.
        drop(unsafe { CString::from_raw(value) });
    }
}
