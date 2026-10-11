//! `Bun.RioTerminal`: a headless Rio VT parser and terminal grid.

use std::sync::{Arc, Mutex, PoisonError};

use bun_jsc::{
    ArrayBuffer, CallFrame, IntegerRange, JSGlobalObject, JSType, JSValue, JsCell, JsResult,
    bun_string_jsc,
};
use rio_vt::{
    ansi::CursorShape,
    config::colors::AnsiColor,
    crosswords::{
        Crosswords, CrosswordsSize, Mode,
        grid::Scroll,
        pos::{Column, Line, Pos},
        square::{Square, Wide},
    },
    event::{EventListener, RioEvent, WindowId},
    performer::handler::Processor,
};

use crate::node::StringOrBuffer;

const DEFAULT_COLS: u32 = 80;
const DEFAULT_ROWS: u32 = 24;
const DEFAULT_SCROLLBACK: u32 = 1000;
const MAX_DIMENSION: i128 = 4096;
const MAX_SCROLLBACK: i128 = 1_000_000;

#[bun_jsc::JsClass]
pub(crate) struct RioTerminal {
    parser: JsCell<Processor>,
    terminal: JsCell<Crosswords<ReplyListener>>,
    replies: Arc<Mutex<Vec<String>>>,
    scrollback: usize,
}

#[derive(Clone)]
struct ReplyListener(Arc<Mutex<Vec<String>>>);

impl EventListener for ReplyListener {
    fn send_event(&self, event: RioEvent, _id: WindowId) {
        if let RioEvent::PtyWrite(_, reply) = event {
            self.0
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(reply);
        }
    }
}

fn make_terminal(
    cols: usize,
    rows: usize,
    scrollback: usize,
    replies: Arc<Mutex<Vec<String>>>,
) -> Crosswords<ReplyListener> {
    Crosswords::new(
        CrosswordsSize::new(cols, rows),
        CursorShape::Block,
        ReplyListener(replies),
        WindowId::from(0),
        0,
        scrollback,
    )
}

fn validate_dimension(
    global: &JSGlobalObject,
    value: JSValue,
    default: u32,
    name: &'static [u8],
) -> JsResult<usize> {
    global
        .validate_integer_range::<u32>(
            value,
            default,
            IntegerRange {
                min: 1,
                max: MAX_DIMENSION,
                field_name: name,
                always_allow_zero: false,
            },
        )
        .map(|n| n as usize)
}

impl RioTerminal {
    pub(crate) fn constructor(
        global: &JSGlobalObject,
        callframe: &CallFrame,
    ) -> JsResult<Box<RioTerminal>> {
        let [options] = callframe.arguments_as_array::<1>();
        let (mut cols, mut rows, mut scrollback) = (
            DEFAULT_COLS as usize,
            DEFAULT_ROWS as usize,
            DEFAULT_SCROLLBACK as usize,
        );
        if !options.is_undefined_or_null() {
            if !options.is_object() {
                return Err(
                    global.throw_invalid_argument_type_value(b"options", b"object", options)
                );
            }
            if let Some(value) = options.get(global, b"cols")? {
                cols = validate_dimension(global, value, DEFAULT_COLS, b"cols")?;
            }
            if let Some(value) = options.get(global, b"rows")? {
                rows = validate_dimension(global, value, DEFAULT_ROWS, b"rows")?;
            }
            if let Some(value) = options.get(global, b"scrollback")? {
                scrollback = global.validate_integer_range::<u32>(
                    value,
                    DEFAULT_SCROLLBACK,
                    IntegerRange {
                        min: 0,
                        max: MAX_SCROLLBACK,
                        field_name: b"scrollback",
                        always_allow_zero: true,
                    },
                )? as usize;
            }
        }
        let replies = Arc::new(Mutex::new(Vec::new()));
        Ok(Box::new(Self {
            parser: JsCell::new(Processor::default()),
            terminal: JsCell::new(make_terminal(cols, rows, scrollback, Arc::clone(&replies))),
            replies,
            scrollback,
        }))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn write(
        &self,
        global: &JSGlobalObject,
        callframe: &CallFrame,
    ) -> JsResult<JSValue> {
        let [data] = callframe.arguments_as_array::<1>();
        let Some(input) = StringOrBuffer::from_js(global, data)? else {
            return Err(global.throw_invalid_argument_type_value(
                b"data",
                b"string or BufferSource",
                data,
            ));
        };
        let bytes = input.slice();
        let old_history = self.terminal.get().history_size();
        self.parser.with_mut(|parser| {
            self.terminal
                .with_mut(|terminal| parser.advance(terminal, bytes));
        });
        let terminal = self.terminal.get();
        let added_rows = terminal.history_size().saturating_sub(old_history);
        global
            .vm()
            .report_extra_memory(added_rows * terminal.columns() * core::mem::size_of::<Square>());
        Ok(JSValue::js_number(bytes.len() as f64))
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn resize(
        &self,
        global: &JSGlobalObject,
        callframe: &CallFrame,
    ) -> JsResult<JSValue> {
        let [cols, rows] = callframe.arguments_as_array::<2>();
        let (current_cols, current_rows) = {
            let terminal = self.terminal.get();
            (terminal.columns() as u32, terminal.screen_lines() as u32)
        };
        let cols = validate_dimension(global, cols, current_cols, b"cols")?;
        let rows = validate_dimension(global, rows, current_rows, b"rows")?;
        let old_cost = self.memory_cost();
        self.terminal
            .with_mut(|terminal| terminal.resize(CrosswordsSize::new(cols, rows)));
        global
            .vm()
            .report_extra_memory(self.memory_cost().saturating_sub(old_cost));
        Ok(JSValue::UNDEFINED)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn reset(
        &self,
        _global: &JSGlobalObject,
        _callframe: &CallFrame,
    ) -> JsResult<JSValue> {
        let (cols, rows) = {
            let terminal = self.terminal.get();
            (terminal.columns(), terminal.screen_lines())
        };
        self.parser.set(Processor::default());
        self.terminal.set(make_terminal(
            cols,
            rows,
            self.scrollback,
            Arc::clone(&self.replies),
        ));
        self.replies
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clear();
        Ok(JSValue::UNDEFINED)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn text(&self, global: &JSGlobalObject, callframe: &CallFrame) -> JsResult<JSValue> {
        let [options] = callframe.arguments_as_array::<1>();
        let include_scrollback = options.is_object()
            && options
                .get_boolean_loose(global, "scrollback")?
                .unwrap_or(false);
        let text = self
            .terminal
            .with_mut(|terminal| terminal_text(terminal, include_scrollback));
        bun_string_jsc::owned_utf8_into_js(global, text.into_bytes())
    }

    /// Row-major cells encoded as four `u32` values: codepoint, foreground, background, flags.
    #[bun_jsc::host_fn(method)]
    pub(crate) fn cells(
        &self,
        global: &JSGlobalObject,
        _callframe: &CallFrame,
    ) -> JsResult<JSValue> {
        let terminal = self.terminal.get();
        let mut bytes = Vec::with_capacity(terminal.columns() * terminal.screen_lines() * 16);
        let display_offset = terminal.display_offset() as i32;
        for row in 0..terminal.screen_lines() {
            for column in 0..terminal.columns() {
                let pos = Pos::new(Line(row as i32 - display_offset), Column(column));
                let square = &terminal.grid[pos];
                let codepoint = terminal
                    .grid
                    .cell_text(pos)
                    .find(|character| *character != '\0')
                    .map(u32::from)
                    .unwrap_or(0);
                let width = match square.wide() {
                    Wide::Wide => 2u32,
                    Wide::Spacer => 0,
                    Wide::Narrow | Wide::LeadingSpacer => 1,
                };
                let style = terminal.grid.style_of(square);
                let flags = u32::from(style.flags.bits())
                    | (u32::from(square.cell_flags().bits()) << 16)
                    | (width << 24);
                for word in [
                    codepoint,
                    encode_color(style.fg),
                    encode_color(style.bg),
                    flags,
                ] {
                    bytes.extend_from_slice(&word.to_ne_bytes());
                }
            }
        }
        ArrayBuffer::from_owned_bytes(bytes.into_boxed_slice(), JSType::Uint32Array).to_js(global)
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn take_replies(
        &self,
        global: &JSGlobalObject,
        _callframe: &CallFrame,
    ) -> JsResult<JSValue> {
        let replies =
            std::mem::take(&mut *self.replies.lock().unwrap_or_else(PoisonError::into_inner))
                .join("");
        bun_string_jsc::owned_utf8_into_js(global, replies.into_bytes())
    }

    #[bun_jsc::host_fn(method)]
    pub(crate) fn cell_text(
        &self,
        global: &JSGlobalObject,
        callframe: &CallFrame,
    ) -> JsResult<JSValue> {
        let [col, row] = callframe.arguments_as_array::<2>();
        let (cols, rows) = {
            let terminal = self.terminal.get();
            (terminal.columns(), terminal.screen_lines())
        };
        let col = global.validate_integer_range::<u32>(
            col,
            0,
            IntegerRange {
                min: 0,
                max: cols as i128 - 1,
                field_name: b"col",
                always_allow_zero: true,
            },
        )?;
        let row = global.validate_integer_range::<u32>(
            row,
            0,
            IntegerRange {
                min: 0,
                max: rows as i128 - 1,
                field_name: b"row",
                always_allow_zero: true,
            },
        )?;
        let terminal = self.terminal.get();
        let pos = Pos::new(
            Line(row as i32 - terminal.display_offset() as i32),
            Column(col as usize),
        );
        let text: String = if matches!(terminal.grid[pos].wide(), Wide::Spacer) {
            String::new()
        } else {
            terminal
                .grid
                .cell_text(pos)
                .filter(|ch| *ch != '\0')
                .collect()
        };
        bun_string_jsc::owned_utf8_into_js(global, text.into_bytes())
    }

    pub(crate) fn memory_cost(&self) -> usize {
        let replies = self.replies.lock().unwrap_or_else(PoisonError::into_inner);
        core::mem::size_of::<Self>() + self.terminal.get().memory_cost()
            - core::mem::size_of::<Crosswords<ReplyListener>>()
            + core::mem::size_of::<Mutex<Vec<String>>>()
            + replies.capacity() * core::mem::size_of::<String>()
            + replies.iter().map(String::capacity).sum::<usize>()
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_cols(&self, _global: &JSGlobalObject) -> JSValue {
        JSValue::js_number(self.terminal.get().columns() as f64)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_rows(&self, _global: &JSGlobalObject) -> JSValue {
        JSValue::js_number(self.terminal.get().screen_lines() as f64)
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_cursor(&self, global: &JSGlobalObject) -> JSValue {
        let cursor = self.terminal.get().cursor();
        let object = JSValue::create_empty_object(global, 3);
        object.put(global, b"col", JSValue::js_number(cursor.pos.col.0 as f64));
        object.put(global, b"row", JSValue::js_number(cursor.pos.row.0 as f64));
        object.put(global, b"visible", JSValue::js_boolean(cursor.is_visible()));
        object
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_title(&self, global: &JSGlobalObject) -> JsResult<JSValue> {
        bun_string_jsc::create_utf8_for_js(global, self.terminal.get().title.as_bytes())
    }

    #[bun_jsc::host_fn(getter)]
    pub(crate) fn get_alternate_screen(&self, _global: &JSGlobalObject) -> JSValue {
        JSValue::js_boolean(self.terminal.get().mode().contains(Mode::ALT_SCREEN))
    }
}

fn encode_color(color: AnsiColor) -> u32 {
    match color {
        AnsiColor::Named(color) => color as u32,
        AnsiColor::Indexed(index) => 0x0100_0000 | u32::from(index),
        AnsiColor::Spec(color) => {
            0x0200_0000
                | (u32::from(color.r) << 16)
                | (u32::from(color.g) << 8)
                | u32::from(color.b)
        }
    }
}

fn terminal_text(terminal: &mut Crosswords<ReplyListener>, include_scrollback: bool) -> String {
    let rows = terminal.screen_lines();
    let old_offset = terminal.display_offset() as i32;
    let mut lines = std::collections::BTreeMap::new();
    if include_scrollback {
        terminal.scroll_display(Scroll::Top);
    }
    loop {
        let offset = terminal.display_offset() as i32;
        for row in 0..rows {
            lines
                .entry(row as i32 - offset)
                .or_insert_with(|| terminal_line(terminal, row as i32 - offset));
        }
        if !include_scrollback || offset == 0 {
            break;
        }
        terminal.scroll_display(Scroll::Delta(-(rows as i32)));
    }
    if include_scrollback {
        let current_offset = terminal.display_offset() as i32;
        terminal.scroll_display(Scroll::Delta(old_offset - current_offset));
    }
    lines.into_values().collect::<Vec<_>>().join("\n")
}

fn terminal_line(terminal: &Crosswords<ReplyListener>, line: i32) -> String {
    (0..terminal.columns())
        .filter_map(|column| {
            let pos = Pos::new(Line(line), Column(column));
            (!matches!(terminal.grid[pos].wide(), Wide::Spacer))
                .then_some(terminal.grid.cell_text(pos))
        })
        .flatten()
        .filter(|character| *character != '\0')
        .collect()
}
