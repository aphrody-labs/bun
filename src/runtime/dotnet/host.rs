//! Host functions of `bun:dotnet`. Arguments are validated by `dotnet.ts`; structured
//! results cross as JSON text that `dotnet.ts` parses.

use std::path::Path;

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

use super::dotnet_error;

fn opt_str_arg(global: &JSGlobalObject, frame: &CallFrame, i: usize) -> JsResult<Option<String>> {
    let value = frame.argument(i);
    if value.is_undefined_or_null() {
        return Ok(None);
    }
    let utf8 = value.to_utf8(global)?;
    Ok(Some(String::from_utf8_lossy(&utf8).into_owned()))
}

fn str_arg(global: &JSGlobalObject, frame: &CallFrame, i: usize) -> JsResult<String> {
    opt_str_arg(global, frame, i)?.ok_or_else(|| {
        global.throw_invalid_arguments(format_args!("argument {i} must be a string"))
    })
}

fn json_string(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + 2);
    out.push('"');
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn json_list(items: &[String]) -> String {
    let items: Vec<String> = items.iter().map(|item| json_string(item)).collect();
    format!("[{}]", items.join(","))
}

/// `locate(dotnetRoot?)` → JSON `{ dotnetRoot, hostfxr, source, muxer, sdks, runtimes }`.
#[bun_jsc::host_fn]
pub(crate) fn js_locate(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let root = opt_str_arg(global, frame, 0)?;
    let location = match root {
        Some(root) => bun_dotnet_host::locate(Some(Path::new(&root))),
        None => bun_dotnet_host::hostfxr().map(|fxr| fxr.location().clone()),
    }
    .map_err(|err| dotnet_error(global, err))?;
    let muxer = location.muxer();
    let json = format!(
        "{{\"dotnetRoot\":{},\"hostfxr\":{},\"source\":{},\"muxer\":{},\"sdks\":{},\"runtimes\":{}}}",
        json_string(&location.dotnet_root.to_string_lossy()),
        json_string(&location.hostfxr.to_string_lossy()),
        json_string(location.source.as_str()),
        if muxer.is_file() {
            json_string(&muxer.to_string_lossy())
        } else {
            "null".to_owned()
        },
        json_list(&location.sdks()),
        json_list(&location.frameworks("Microsoft.NETCore.App")),
    );
    bun_jsc::bun_string_jsc::create_utf8_for_js(global, json.as_bytes())
}

/// `initialize(runtimeConfig?)` → 0 (started here), 1 or 2 (already running).
#[bun_jsc::host_fn]
pub(crate) fn js_initialize(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let config = opt_str_arg(global, frame, 0)?;
    let runtime = bun_dotnet_host::hostfxr()
        .and_then(|fxr| fxr.runtime(config.as_deref().map(Path::new)))
        .map_err(|err| dotnet_error(global, err))?;
    Ok(JSValue::js_number(f64::from(runtime.init_status)))
}

/// `functionPointer(assembly?, type, method, delegateType?)` → native address.
#[bun_jsc::host_fn]
pub(crate) fn js_function_pointer(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let assembly = opt_str_arg(global, frame, 0)?;
    let type_name = str_arg(global, frame, 1)?;
    let method = str_arg(global, frame, 2)?;
    let delegate_type = opt_str_arg(global, frame, 3)?;
    let pointer = bun_dotnet_host::hostfxr()
        .and_then(|fxr| {
            fxr.runtime(None)?.function_pointer(
                fxr,
                assembly.as_deref().map(Path::new),
                &type_name,
                &method,
                delegate_type.as_deref(),
            )
        })
        .map_err(|err| dotnet_error(global, err))?;
    Ok(JSValue::js_number(pointer as usize as f64))
}

/// `loadAssembly(path)` into the default load context.
#[bun_jsc::host_fn]
pub(crate) fn js_load_assembly(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let assembly = str_arg(global, frame, 0)?;
    bun_dotnet_host::hostfxr()
        .and_then(|fxr| fxr.runtime(None)?.load_assembly(fxr, Path::new(&assembly)))
        .map_err(|err| dotnet_error(global, err))?;
    Ok(JSValue::UNDEFINED)
}

/// `runtimeConfig()` → the `.runtimeconfig.json` the CLR started with, or null before start.
#[bun_jsc::host_fn]
pub(crate) fn js_runtime_config(global: &JSGlobalObject, _frame: &CallFrame) -> JsResult<JSValue> {
    match bun_dotnet_host::hostfxr()
        .ok()
        .and_then(|fxr| fxr.started())
    {
        Some(runtime) => {
            bun_jsc::bun_string_jsc::create_utf8_for_js(global, runtime.runtime_config().as_bytes())
        }
        None => Ok(JSValue::NULL),
    }
}
