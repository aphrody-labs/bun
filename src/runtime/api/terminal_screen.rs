//! `Bun.TerminalScreen`: the headless VT screen of `bun_vt` exposed to JS.

use bun_core::strings;
use bun_jsc::{
    bun_string_jsc, ArrayBuffer, CallFrame, IntegerRange, JSGlobalObject, JSType, JSValue, JsCell,
    JsResult,
};
use bun_vt::Screen;

use crate::node::StringOrBuffer;

const DEFAULT_COLS: u32 = 80;
const DEFAULT_ROWS: u32 = 24;
const DEFAULT_SCROLLBACK: u32 = 1000;
const MAX_DIMENSION: i128 = 4096;
const MAX_SCROLLBACK: i128 = 1_000_000;

#[bun_jsc::JsClass]
pub(crate) struct TerminalScreen {
    screen: JsCell<Screen>,
    scrollback: usize,
    convert_eol: bool,
}

fn codepoint_width(codepoint: u32) -> u8 {
    let Some(ch) = char::from_u32(codepoint) else {
        return 1;
    };
    let mut utf8 = [0u8; 4];
    let width = strings::visible::width::exclude_ansi_colors::utf8(ch.encode_utf8(&mut utf8).as_bytes());
    width.min(2) as u8
}

fn validate_dimension(
    global: &JSGlobalObject,
    value: JSValue,
    default: u32,
    field_name: &'static [u8],
) -> JsResult<usize> {
    let n = global.validate_integer_range::<u32>(
        value,
        default,
        IntegerRange {
            min: 1,
            max: MAX_DIMENSION,
            field_name,
            always_allow_zero: false,
        },
    )?;
    Ok(n as usize)
}

impl TerminalScreen {
    pub(crate) fn constructor(
        global_this: &JSGlobalObject,
        callframe: &CallFrame,
    ) -> JsResult<Box<TerminalScreen>> {
        let [options] = callframe.arguments_as_array::<1>();
        let mut cols = DEFAULT_COLS as usize;
        let mut rows = DEFAULT_ROWS as usize;
        let mut scrollback = DEFAULT_SCROLLBACK as usize;
        let mut convert_eol = false;
        if !options.is_undefined_or_null() {
            if !options.is_object() {
                return Err(global_this.throw_invalid_argument_type_value(b"options", b"object", options));
            }
            if let Some(v) = options.get(global_this, b"cols")? {
                cols = validate_dimension(global_this, v, DEFAULT_COLS, b"cols")?;
            }
            if let Some(v) = options.get(global_this, b"rows")? {
                rows = validate_dimension(global_this, v, DEFAULT_ROWS, b"rows")?;
            }
            if let Some(v) = options.get(global_this, b"scrollback")? {
                scrollback = global_this.validate_integer_range::<u32>(
                    v,
                    DEFAULT_SCROLLBACK,
                    IntegerRange {
                        min: 0,
                        max: MAX_SCROLLBACK,
                        field_name: b"scrollback",
                        always_allow_zero: true,
                    },
                )? as usize;
            }
            convert_eol = options.get_boolean_loose(global_this, "convertEol")?.unwrap_or(false);
        }
        Ok(Box::new(TerminalScreen {
            screen: JsCell::new(Screen::new(cols, rows, scrollback, convert_eol, codepoint_width)),
            scrollback,
            convert_eol,
        }))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn write(&self, global_this: &JSGlobalObject, callframe: &CallFrame) -> JsResult<JSValue> {
        let [data] = callframe.arguments_as_array::<1>();
        let Some(input) = StringOrBuffer::from_js(global_this, data)? else {
            return Err(global_this.throw_invalid_argument_type_value(
                b"data",
                b"string or BufferSource",
                data,
            ));
        };
        let bytes = input.slice();
        self.screen.with_mut(|screen| screen.write(bytes));
        Ok(JSValue::js_number(bytes.len() as f64))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn resize(&self, global_this: &JSGlobalObject, callframe: &CallFrame) -> JsResult<JSValue> {
        let [cols, rows] = callframe.arguments_as_array::<2>();
        let (current_cols, current_rows) = {
            let screen = self.screen.get();
            (screen.cols() as u32, screen.rows() as u32)
        };
        let cols = validate_dimension(global_this, cols, current_cols, b"cols")?;
        let rows = validate_dimension(global_this, rows, current_rows, b"rows")?;
        self.screen.with_mut(|screen| screen.resize(cols, rows));
        Ok(JSValue::UNDEFINED)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn reset(&self, _global_this: &JSGlobalObject, _callframe: &CallFrame) -> JsResult<JSValue> {
        let (cols, rows) = {
            let screen = self.screen.get();
            (screen.cols(), screen.rows())
        };
        self.screen
            .set(Screen::new(cols, rows, self.scrollback, self.convert_eol, codepoint_width));
        Ok(JSValue::UNDEFINED)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn text(&self, global_this: &JSGlobalObject, callframe: &CallFrame) -> JsResult<JSValue> {
        let [options] = callframe.arguments_as_array::<1>();
        let include_scrollback = if options.is_object() {
            options.get_boolean_loose(global_this, "scrollback")?.unwrap_or(false)
        } else {
            false
        };
        let text = self.screen.get().text(include_scrollback);
        bun_string_jsc::owned_utf8_into_js(global_this, text)
    }

    /// Four `u32` per visible cell, row-major: codepoint, fg, bg, flags.
    #[bun_jsc::host_fn(method)]
    pub(crate) fn cells(&self, global_this: &JSGlobalObject, _callframe: &CallFrame) -> JsResult<JSValue> {
        let screen = self.screen.get();
        let mut bytes = Vec::with_capacity(screen.cells().len() * 16);
        for cell in screen.cells() {
            for word in [cell.codepoint, cell.fg, cell.bg, cell.flags] {
                bytes.extend_from_slice(&word.to_ne_bytes());
            }
        }
        ArrayBuffer::from_owned_bytes(bytes.into_boxed_slice(), JSType::Uint32Array).to_js(global_this)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn take_replies(&self, global_this: &JSGlobalObject, _callframe: &CallFrame) -> JsResult<JSValue> {
        let replies = self.screen.with_mut(Screen::take_replies);
        bun_string_jsc::owned_utf8_into_js(global_this, replies)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_cols(&self, _global_this: &JSGlobalObject) -> JSValue {
        JSValue::js_number(self.screen.get().cols() as f64)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_rows(&self, _global_this: &JSGlobalObject) -> JSValue {
        JSValue::js_number(self.screen.get().rows() as f64)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_cursor(&self, global_this: &JSGlobalObject) -> JSValue {
        let (col, row, visible) = self.screen.get().cursor();
        let cursor = JSValue::create_empty_object(global_this, 3);
        cursor.put(global_this, b"col", JSValue::js_number(col as f64));
        cursor.put(global_this, b"row", JSValue::js_number(row as f64));
        cursor.put(global_this, b"visible", JSValue::js_boolean(visible));
        cursor
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_title(&self, global_this: &JSGlobalObject) -> JsResult<JSValue> {
        bun_string_jsc::create_utf8_for_js(global_this, self.screen.get().title())
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_alternate_screen(&self, _global_this: &JSGlobalObject) -> JSValue {
        JSValue::js_boolean(self.screen.get().is_alternate_screen())
    }
}
