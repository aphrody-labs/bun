//! `bun:dotnet` — the CLR hosted in the Bun process through `bun-dotnet-host`
//! (packages/bun-dotnet-native). The JS module is `src/js/bun/dotnet.ts`; it calls the
//! `js_*` host functions in [`host`] through `$newRustFunction`.

pub(crate) mod host;
pub(crate) mod tools;

use bun_jsc::{JSGlobalObject, JsError};

/// Throws an `Error` with `code = "ERR_BUN_DOTNET"` and, for .NET failures, `hresult`.
pub(crate) fn dotnet_error(global: &JSGlobalObject, err: bun_dotnet_host::Error) -> JsError {
    let value = global.create_error_instance(format_args!("{}", err.message));
    if let Ok(code) = bun_jsc::bun_string_jsc::create_utf8_for_js(global, b"ERR_BUN_DOTNET") {
        value.put(global, "code", code);
    }
    if let Some(hresult) = err.code {
        value.put(
            global,
            "hresult",
            bun_jsc::JSValue::js_number(f64::from(hresult as u32)),
        );
    }
    global.throw_value(value)
}
