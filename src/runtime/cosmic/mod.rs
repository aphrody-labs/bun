//! `bun:cosmic` host functions. The JS module is `src/js/bun/cosmic.ts`; the work is done by the
//! `bun_cosmic` crate (cosmic-text, freedesktop-desktop-entry), which returns trees as JSON that
//! the JS side parses. Every function exists on every platform; outside Linux `bun_cosmic`
//! answers `Unsupported` and they throw `ERR_BUN_COSMIC_UNSUPPORTED`.

pub(crate) mod apps;
pub(crate) mod text;

use bun_jsc::{JSGlobalObject, JSValue, JsError, JsResult};

/// Throw `err` as an `Error` carrying its `code`.
pub(crate) fn throw(global: &JSGlobalObject, err: bun_cosmic::Error) -> JsError {
    let value = global.create_error_instance(format_args!("{}", err.message()));
    match bun_jsc::bun_string_jsc::create_utf8_for_js(global, err.code().as_bytes()) {
        Ok(code) => value.put(global, "code", code),
        Err(pending) => return pending,
    }
    global.throw_value(value)
}

/// JSON bytes from `bun_cosmic` as a JS string, for `JSON.parse` in `cosmic.ts`.
pub(crate) fn json(
    global: &JSGlobalObject,
    result: Result<Vec<u8>, bun_cosmic::Error>,
) -> JsResult<JSValue> {
    match result {
        Ok(bytes) => bun_jsc::bun_string_jsc::create_utf8_for_js(global, &bytes),
        Err(err) => Err(throw(global, err)),
    }
}
