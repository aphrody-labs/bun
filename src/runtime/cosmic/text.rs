//! `bun:cosmic` text: layout, rasterization and the font database (cosmic-text).
//!
//! Text arguments, validated by `cosmic.ts`: `text, fontSize, lineHeight, width, height, family,
//! weight, italic, wrap, align, color` (`width`/`height` may be `undefined`, `color` is `0xRRGGBBAA`).

use bun_jsc::{ArrayBuffer, CallFrame, JSGlobalObject, JSValue, JsResult};

fn opt_f32(value: JSValue) -> Option<f32> {
    if value.is_undefined_or_null() {
        None
    } else {
        Some(value.as_number() as f32)
    }
}

fn opt_u32(value: JSValue) -> Option<u32> {
    if value.is_undefined_or_null() {
        None
    } else {
        Some(value.to_int64().clamp(0, i64::from(u32::MAX)) as u32)
    }
}

fn utf8<'a>(global: &JSGlobalObject, bytes: &'a [u8]) -> JsResult<&'a str> {
    core::str::from_utf8(bytes)
        .map_err(|_| global.throw_invalid_arguments(format_args!("text must be valid UTF-16")))
}

fn with_options<R>(
    global: &JSGlobalObject,
    frame: &CallFrame,
    f: impl FnOnce(&bun_cosmic::TextOptions<'_>) -> JsResult<R>,
) -> JsResult<R> {
    let text = frame.argument(0).to_utf8(global)?;
    let family = frame.argument(5).to_utf8(global)?;
    let options = bun_cosmic::TextOptions {
        text: utf8(global, &text)?,
        font_size: frame.argument(1).as_number() as f32,
        line_height: frame.argument(2).as_number() as f32,
        width: opt_f32(frame.argument(3)),
        height: opt_f32(frame.argument(4)),
        family: utf8(global, &family)?,
        weight: frame.argument(6).to_int32().clamp(1, 1000) as u16,
        italic: frame.argument(7).to_boolean(),
        wrap: frame.argument(8).to_int32().clamp(0, 3) as u8,
        align: frame.argument(9).to_int32().clamp(0, 5) as u8,
        color: frame.argument(10).to_int64() as u32,
    };
    f(&options)
}

/// `textLayout(...text arguments)` returns the layout as JSON.
#[bun_jsc::host_fn]
pub(crate) fn js_text_layout(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    with_options(global, frame, |options| {
        super::json(global, bun_cosmic::layout(options))
    })
}

/// `textRender(...text arguments, imageWidth, imageHeight, background)` returns
/// `{ width, height, data }`, `data` being straight RGBA8 rows.
#[bun_jsc::host_fn]
pub(crate) fn js_text_render(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    with_options(global, frame, |options| {
        let image = bun_cosmic::render(
            options,
            opt_u32(frame.argument(11)),
            opt_u32(frame.argument(12)),
            frame.argument(13).to_int64() as u32,
        )
        .map_err(|err| super::throw(global, err))?;
        let data = ArrayBuffer::create_uint8_array(global, &image.rgba)?;
        let result = JSValue::create_empty_object(global, 3);
        result.put(global, "width", JSValue::js_number(f64::from(image.width)));
        result.put(
            global,
            "height",
            JSValue::js_number(f64::from(image.height)),
        );
        result.put(global, "data", data);
        Ok(result)
    })
}

/// `loadFont(bytes)` returns the added family names as JSON.
#[bun_jsc::host_fn]
pub(crate) fn js_load_font(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let Some(bytes) = frame.argument(0).as_array_buffer(global) else {
        return Err(global.throw_invalid_arguments(format_args!(
            "font must be an ArrayBuffer or ArrayBufferView"
        )));
    };
    let data = bytes.slice().to_vec();
    super::json(global, bun_cosmic::load_font(data))
}

/// `fonts()` returns every face of the font database as JSON.
#[bun_jsc::host_fn]
pub(crate) fn js_fonts(global: &JSGlobalObject, frame: &CallFrame) -> JsResult<JSValue> {
    let _ = frame;
    super::json(global, bun_cosmic::fonts())
}
