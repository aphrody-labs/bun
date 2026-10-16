//! `bun:privacy` host function: one byte-oriented entry point over
//! `bun_privacy::call`. The JS module validates and frames arguments.

use bun_jsc::{ArrayBuffer, CallFrame, JSGlobalObject, JSValue, JsResult};

const MAX_ARGS: usize = 7;

pub(crate) fn js_privacy(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let op = frame.argument(0).to_utf8(global)?;
    let op = core::str::from_utf8(&op)
        .map_err(|_| global.throw_invalid_arguments(format_args!("privacy operation must be ASCII")))?
        .to_owned();
    let mut buffers: Vec<Option<ArrayBuffer>> = Vec::with_capacity(MAX_ARGS);
    for index in 0..MAX_ARGS {
        let value = frame.argument(index + 1);
        if value.is_undefined_or_null() {
            buffers.push(None);
            continue;
        }
        let Some(buffer) = value.as_array_buffer(global) else {
            return Err(global.throw_invalid_arguments(format_args!(
                "privacy argument {index} must be an ArrayBufferView"
            )));
        };
        buffers.push(Some(buffer));
    }
    let args: Vec<&[u8]> = buffers
        .iter()
        .map(|buffer| buffer.as_ref().map_or(&[][..], |b| b.byte_slice()))
        .collect();
    let output = bun_privacy::call(&op, &args)
        .map_err(|error| global.throw_invalid_arguments(format_args!("{error}")))?;
    match output {
        bun_privacy::Output::Bool(value) => Ok(JSValue::js_boolean(value)),
        bun_privacy::Output::Bytes(bytes) => ArrayBuffer::create_uint8_array(global, &bytes),
        bun_privacy::Output::List(list) => JSValue::create_array_from_iter(global, list.iter(), |bytes| {
            ArrayBuffer::create_uint8_array(global, bytes)
        }),
    }
}
