//! `bun:windows` — synchronous bindings to Windows 11 system interfaces.
//!
//! The JS module is `src/js/bun/windows.ts`; it validates arguments and calls the
//! `js_*` host functions in [`host`] through `$newRustFunction`. The Win32 code lives
//! in [`sys`], which has no JSC types and returns structured results as JSON text.
//!
//! Every host function exists on every platform so the generated thunks link.
//! Outside Windows they throw `ERR_BUN_WINDOWS_UNSUPPORTED`.

pub(crate) mod host;
#[cfg(windows)]
pub(crate) mod sys;

use bun_jsc::{JSGlobalObject, JsError};

#[cfg(not(windows))]
pub(crate) fn unsupported(global: &JSGlobalObject) -> JsError {
    let err =
        global.create_error_instance(format_args!("bun:windows is only available on Windows"));
    if let Ok(code) =
        bun_jsc::bun_string_jsc::create_utf8_for_js(global, b"ERR_BUN_WINDOWS_UNSUPPORTED")
    {
        err.put(global, "code", code);
    }
    global.throw_value(err)
}

/// Throws a `SystemError` for a failed Win32 call: `code`/`errno` from the libuv mapping,
/// `syscall` = the API name, `winError` = the raw `GetLastError`/`HRESULT` value and the
/// system message text.
#[cfg(windows)]
pub(crate) fn win_error(global: &JSGlobalObject, err: sys::WinErr) -> JsError {
    // HRESULT_FROM_WIN32 wraps a Win32 code as 0x8007xxxx.
    let win32 = if err.code & 0xFFFF_0000 == 0x8007_0000 {
        err.code & 0xFFFF
    } else {
        err.code
    };
    let base = if win32 <= u16::MAX as u32 {
        bun_sys::Error::from_win32(
            bun_sys::windows::Win32Error::from_raw(win32 as u16),
            bun_sys::Tag::TODO,
        )
    } else {
        bun_sys::Error::from_code(bun_sys::E::UNKNOWN, bun_sys::Tag::TODO)
    };
    let mut system = base.to_system_error();
    let text = sys::message(err.code);
    let message = match base.uv_code_label() {
        Some((code, _)) => format!("{code}: {text}, {}", err.call),
        None => format!("{text}, {}", err.call),
    };
    system.syscall = bun_core::String::static_(err.call.as_bytes());
    system.message = bun_core::String::clone_utf8(message.as_bytes());
    let value = bun_jsc::SystemError::from(system).to_error_instance(global);
    value.put(
        global,
        "winError",
        bun_jsc::JSValue::js_number(err.code as f64),
    );
    global.throw_value(value)
}
