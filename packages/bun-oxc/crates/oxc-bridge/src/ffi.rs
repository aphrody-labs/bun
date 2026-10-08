//! C ABI 1. Every function returns a heap-allocated JSON string that the caller releases with
//! `aphrody_oxc_free`. These are thin wrappers over the safe API at the crate root.

use std::{
    ffi::{CStr, CString, c_char},
    panic::{UnwindSafe, catch_unwind},
};

use crate::Error;

#[unsafe(no_mangle)]
pub extern "C" fn aphrody_oxc_abi_version() -> u32 {
    1
}

/// Reads the two NUL-terminated arguments and runs `operation`, turning a panic into `on_panic`.
///
/// # Safety
/// Non-null pointers must reference NUL-terminated strings that stay valid for the call.
unsafe fn guarded<T>(
    source: *const c_char,
    filename: *const c_char,
    operation: impl FnOnce(&str, &str) -> Result<T, Error> + UnwindSafe,
    on_panic: &'static str,
) -> Result<T, Error> {
    catch_unwind(|| {
        if source.is_null() || filename.is_null() {
            return Err(Error::input("source and filename must be non-null"));
        }
        // SAFETY: Public entry points require valid NUL-terminated UTF-8 strings.
        let source = unsafe { CStr::from_ptr(source) }
            .to_str()
            .map_err(|error| Error::input(error.to_string()))?;
        // SAFETY: Same contract as source, checked for null above.
        let filename = unsafe { CStr::from_ptr(filename) }
            .to_str()
            .map_err(|error| Error::input(error.to_string()))?;
        operation(source, filename)
    })
    .unwrap_or_else(|_| Err(Error::new(crate::ErrorKind::Panic, on_panic)))
}

fn into_c(response: &serde_json::Value) -> *mut c_char {
    CString::new(response.to_string()).map_or(std::ptr::null_mut(), CString::into_raw)
}

/// `{ok, error}` for the format/minify/lint family.
fn failure(error: &Error) -> serde_json::Value {
    serde_json::json!({"ok": false, "error": error.message})
}

/// Format JavaScript or TypeScript, using the filename extension to choose syntax.
/// # Safety
/// Both pointers must reference NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn aphrody_oxc_format(
    source: *const c_char,
    filename: *const c_char,
) -> *mut c_char {
    // SAFETY: Forwarded caller contract.
    let outcome = unsafe { guarded(source, filename, crate::format, "Oxc operation panicked") };
    into_c(&match outcome {
        Ok(code) => serde_json::json!({"ok": true, "code": code}),
        Err(error) => failure(&error),
    })
}

/// Minify JavaScript or TypeScript, using the filename extension to choose syntax.
/// # Safety
/// Both pointers must reference NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn aphrody_oxc_minify(
    source: *const c_char,
    filename: *const c_char,
) -> *mut c_char {
    // SAFETY: Forwarded caller contract.
    let outcome = unsafe { guarded(source, filename, crate::minify, "Oxc operation panicked") };
    into_c(&match outcome {
        Ok(code) => serde_json::json!({"ok": true, "code": code}),
        Err(error) => failure(&error),
    })
}

/// Lint JS/TS source with Oxc's default rule set and return JSON diagnostics.
/// # Safety
/// Both pointers must reference NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn aphrody_oxc_lint(
    source: *const c_char,
    filename: *const c_char,
) -> *mut c_char {
    // SAFETY: Forwarded caller contract.
    let outcome = unsafe { guarded(source, filename, crate::lint, "Oxc lint panicked") };
    into_c(&match outcome {
        Ok(diagnostics) => serde_json::json!({"ok": true, "diagnostics": diagnostics}),
        Err(error) => failure(&error),
    })
}

fn analysis(
    source: *const c_char,
    filename: *const c_char,
    operation: fn(&str, &str) -> Result<serde_json::Value, Error>,
) -> *mut c_char {
    // SAFETY: Callers are the unsafe extern functions below, which forward their own contract.
    let outcome = unsafe { guarded(source, filename, operation, "Oxc analysis panicked") };
    into_c(&match outcome {
        Ok(value) => serde_json::json!({"ok": true, "result": value}),
        Err(error) => {
            serde_json::json!({"ok": false, "kind": error.kind.as_str(), "error": error.message})
        },
    })
}

/// Analyze static ESM imports and exports, preserving TypeScript declarations and source order.
/// # Safety
/// Both pointers must reference valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn aphrody_oxc_analyze(
    source: *const c_char,
    filename: *const c_char,
) -> *mut c_char {
    analysis(source, filename, crate::analyze)
}

/// Serialize the official Oxc ESTree program. Span positions use UTF-16 code units.
/// # Safety
/// Both pointers must reference valid NUL-terminated UTF-8 strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn aphrody_oxc_parse(
    source: *const c_char,
    filename: *const c_char,
) -> *mut c_char {
    analysis(source, filename, crate::parse)
}

/// Release exactly one string returned by this bridge. Null is accepted.
/// # Safety
/// `pointer` must be null or a live pointer returned by this bridge, released once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn aphrody_oxc_free(pointer: *mut c_char) {
    if !pointer.is_null() {
        // SAFETY: The caller guarantees ownership and a single release.
        drop(unsafe { CString::from_raw(pointer) });
    }
}
