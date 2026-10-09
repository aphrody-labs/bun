// SPDX-License-Identifier: Apache-2.0
// Origin: aphrody-labs/aphrody crates/shell/aphrody-term/src/parser.rs (Apache-2.0).
// The parser is a resumable state machine, so escape sequences and UTF-8
// sequences split across `write` calls are kept.

use crate::grid::{Cell, Cursor, Grid, flags, push_row_text};

const MAX_PARAMS: usize = 32;
const MAX_PARAM_VALUE: u32 = 0xFFFF;
const MAX_OSC_LEN: usize = 4096;
const TAB_WIDTH: usize = 8;

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Ground,
    Escape,
    /// `ESC` + intermediate byte(s) (charset designation and friends): wait for the final byte.
    EscapeIntermediate,
    Csi,
    Osc,
    OscEscape,
    /// DCS / SOS / PM / APC strings: skipped until ST or BEL.
    IgnoreString,
    IgnoreStringEscape,
}

#[derive(Clone, Copy)]
struct Pen {
    fg: u32,
    bg: u32,
    flags: u32,
}

impl Pen {
    const DEFAULT: Pen = Pen {
        fg: 0,
        bg: 0,
        flags: 0,
    };
}

#[derive(Clone, Copy)]
struct Saved {
    col: usize,
    row: usize,
    pen: Pen,
    wrap_pending: bool,
}

/// Terminal width of one non-ASCII codepoint: 0 (combining), 1 or 2.
pub type WidthFn = fn(u32) -> u8;

/// A headless VT100/xterm screen: feed it the bytes a program writes to a
/// terminal and read back the cell grid, cursor, title and replies.
pub struct Screen {
    grid: Grid,
    width: WidthFn,
    convert_eol: bool,
    autowrap: bool,
    wrap_pending: bool,
    pen: Pen,
    saved: Saved,
    alt_saved: Option<Saved>,
    scroll_top: usize,
    scroll_bottom: usize,
    last_printed: Option<u32>,

    state: State,
    params: [u32; MAX_PARAMS],
    colon: [bool; MAX_PARAMS],
    nparams: usize,
    param_started: bool,
    private: u8,
    intermediate: u8,
    osc: Vec<u8>,
    utf8_buf: [u8; 4],
    utf8_len: usize,
    utf8_need: usize,

    title: Vec<u8>,
    replies: Vec<u8>,
}

impl Screen {
    /// `scrollback` is the number of evicted rows kept; `width` sizes non-ASCII codepoints.
    pub fn new(
        cols: usize,
        rows: usize,
        scrollback: usize,
        convert_eol: bool,
        width: WidthFn,
    ) -> Screen {
        let grid = Grid::new(cols, rows, scrollback);
        let rows = grid.rows();
        Screen {
            grid,
            width,
            convert_eol,
            autowrap: true,
            wrap_pending: false,
            pen: Pen::DEFAULT,
            saved: Saved {
                col: 0,
                row: 0,
                pen: Pen::DEFAULT,
                wrap_pending: false,
            },
            alt_saved: None,
            scroll_top: 0,
            scroll_bottom: rows,
            last_printed: None,
            state: State::Ground,
            params: [0; MAX_PARAMS],
            colon: [false; MAX_PARAMS],
            nparams: 0,
            param_started: false,
            private: 0,
            intermediate: 0,
            osc: Vec::new(),
            utf8_buf: [0; 4],
            utf8_len: 0,
            utf8_need: 0,
            title: Vec::new(),
            replies: Vec::new(),
        }
    }

    pub fn cols(&self) -> usize {
        self.grid.cols()
    }

    pub fn rows(&self) -> usize {
        self.grid.rows()
    }

    /// `(col, row, visible)`, zero-based.
    pub fn cursor(&self) -> (usize, usize, bool) {
        let Cursor { col, row, visible } = self.grid.cursor;
        (col, row, visible)
    }

    /// Visible cells, row-major.
    pub fn cells(&self) -> &[Cell] {
        self.grid.cells()
    }

    pub fn is_alternate_screen(&self) -> bool {
        self.grid.is_alternate()
    }

    /// Last title set with OSC 0 or OSC 2, as UTF-8 bytes.
    pub fn title(&self) -> &[u8] {
        &self.title
    }

    /// Bytes the terminal answers to queries (cursor position, device attributes), for the program's stdin.
    pub fn take_replies(&mut self) -> Vec<u8> {
        core::mem::take(&mut self.replies)
    }

    /// Screen text as UTF-8: one line per row, trailing blanks and trailing empty rows trimmed.
    pub fn text(&self, include_scrollback: bool) -> Vec<u8> {
        let mut out = Vec::new();
        if include_scrollback {
            for row in self.grid.scrollback() {
                push_row_text(&mut out, row);
                out.push(b'\n');
            }
        }
        for r in 0..self.grid.rows() {
            push_row_text(&mut out, self.grid.row(r));
            out.push(b'\n');
        }
        while out.last() == Some(&b'\n') {
            out.pop();
        }
        out
    }

    pub fn resize(&mut self, cols: usize, rows: usize) {
        self.grid.resize(cols, rows);
        self.scroll_top = 0;
        self.scroll_bottom = self.grid.rows();
        self.wrap_pending = false;
    }

    pub fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.advance(b);
        }
    }

    fn advance(&mut self, b: u8) {
        match self.state {
            State::Ground => self.ground(b),
            State::Escape => self.escape(b),
            State::EscapeIntermediate => {
                if !(0x20..=0x2F).contains(&b) {
                    self.state = State::Ground;
                }
            }
            State::Csi => self.csi(b),
            State::Osc => match b {
                0x07 => self.finish_osc(),
                0x1B => self.state = State::OscEscape,
                _ => {
                    if self.osc.len() < MAX_OSC_LEN {
                        self.osc.push(b);
                    }
                }
            },
            State::OscEscape => {
                if b == b'\\' {
                    self.finish_osc();
                } else {
                    self.osc.clear();
                    self.state = State::Escape;
                    self.escape(b);
                }
            }
            State::IgnoreString => match b {
                0x07 | 0x18 | 0x1A => self.state = State::Ground,
                0x1B => self.state = State::IgnoreStringEscape,
                _ => {}
            },
            State::IgnoreStringEscape => {
                self.state = if b == b'\\' {
                    State::Ground
                } else {
                    State::IgnoreString
                };
            }
        }
    }

    fn ground(&mut self, b: u8) {
        if self.utf8_len > 0 {
            if b & 0xC0 == 0x80 {
                self.push_utf8_continuation(b);
                return;
            }
            self.utf8_len = 0;
            self.print(u32::from(char::REPLACEMENT_CHARACTER));
        }
        match b {
            0x20..=0x7E => self.print(u32::from(b)),
            0x1B => self.begin_escape(),
            0x80..=0xFF => self.push_utf8_lead(b),
            _ => self.control(b),
        }
    }

    fn control(&mut self, b: u8) {
        match b {
            b'\r' => {
                self.grid.cursor.col = 0;
                self.wrap_pending = false;
            }
            b'\n' | 0x0B | 0x0C => {
                self.linefeed();
                if self.convert_eol {
                    self.grid.cursor.col = 0;
                }
            }
            0x08 => {
                self.grid.cursor.col = self.grid.cursor.col.saturating_sub(1);
                self.wrap_pending = false;
            }
            b'\t' => {
                let next = (self.grid.cursor.col / TAB_WIDTH + 1) * TAB_WIDTH;
                self.grid.cursor.col = next.min(self.grid.cols() - 1);
            }
            _ => {}
        }
    }

    fn push_utf8_lead(&mut self, b: u8) {
        let need = match b {
            0xC2..=0xDF => 2,
            0xE0..=0xEF => 3,
            0xF0..=0xF4 => 4,
            _ => {
                self.print(u32::from(char::REPLACEMENT_CHARACTER));
                return;
            }
        };
        self.utf8_buf[0] = b;
        self.utf8_len = 1;
        self.utf8_need = need;
    }

    fn push_utf8_continuation(&mut self, b: u8) {
        self.utf8_buf[self.utf8_len] = b;
        self.utf8_len += 1;
        if self.utf8_len < self.utf8_need {
            return;
        }
        let len = self.utf8_len;
        self.utf8_len = 0;
        let bytes = &self.utf8_buf[..len];
        let mut cp = u32::from(bytes[0]) & (0x7F >> len);
        for &c in &bytes[1..] {
            cp = (cp << 6) | (u32::from(c) & 0x3F);
        }
        let min = match len {
            2 => 0x80,
            3 => 0x800,
            _ => 0x1_0000,
        };
        let valid = cp >= min && char::from_u32(cp).is_some();
        self.print(if valid {
            cp
        } else {
            u32::from(char::REPLACEMENT_CHARACTER)
        });
    }

    fn begin_escape(&mut self) {
        self.state = State::Escape;
        self.intermediate = 0;
    }

    fn escape(&mut self, b: u8) {
        self.state = State::Ground;
        match b {
            b'[' => {
                self.state = State::Csi;
                self.nparams = 0;
                self.param_started = false;
                self.private = 0;
                self.intermediate = 0;
                self.params = [0; MAX_PARAMS];
                self.colon = [false; MAX_PARAMS];
            }
            b']' => {
                self.state = State::Osc;
                self.osc.clear();
            }
            b'P' | b'X' | b'^' | b'_' => self.state = State::IgnoreString,
            0x20..=0x2F => {
                self.intermediate = b;
                self.state = State::EscapeIntermediate;
            }
            b'7' => self.save_cursor(),
            b'8' => self.restore_cursor(),
            b'D' => self.linefeed(),
            b'E' => {
                self.linefeed();
                self.grid.cursor.col = 0;
            }
            b'M' => self.reverse_index(),
            b'c' => self.full_reset(),
            0x1B => self.begin_escape(),
            _ => {}
        }
    }

    fn csi(&mut self, b: u8) {
        match b {
            b'0'..=b'9' => {
                if self.nparams == 0 {
                    self.nparams = 1;
                }
                let i = self.nparams - 1;
                if i < MAX_PARAMS {
                    self.params[i] =
                        (self.params[i] * 10 + u32::from(b - b'0')).min(MAX_PARAM_VALUE);
                }
                self.param_started = true;
            }
            b';' | b':' => {
                if self.nparams == 0 {
                    self.nparams = 1;
                }
                if self.nparams < MAX_PARAMS {
                    self.colon[self.nparams] = b == b':';
                }
                self.nparams += 1;
            }
            0x3C..=0x3F => {
                if !self.param_started && self.nparams == 0 {
                    self.private = b;
                }
            }
            0x20..=0x2F => self.intermediate = b,
            0x40..=0x7E => {
                self.state = State::Ground;
                self.nparams = self.nparams.min(MAX_PARAMS);
                if self.intermediate == 0 {
                    self.execute_csi(b);
                }
            }
            0x1B => self.begin_escape(),
            0x18 | 0x1A => self.state = State::Ground,
            0x00..=0x1F => self.control(b),
            _ => {}
        }
    }

    fn finish_osc(&mut self) {
        self.state = State::Ground;
        if let [b'0' | b'2', b';', title @ ..] = self.osc.as_slice() {
            self.title = title.to_vec();
        }
        self.osc.clear();
    }

    /// Parameter `i`, with 0 or missing replaced by `default`.
    fn param(&self, i: usize, default: u32) -> u32 {
        match self.params[..self.nparams].get(i) {
            Some(&0) | None => default,
            Some(&v) => v,
        }
    }

    fn count(&self) -> usize {
        self.param(0, 1) as usize
    }

    fn execute_csi(&mut self, final_byte: u8) {
        let cols = self.grid.cols();
        let rows = self.grid.rows();
        if self.private == b'?' {
            if matches!(final_byte, b'h' | b'l') {
                let enable = final_byte == b'h';
                for i in 0..self.nparams.max(1) {
                    self.set_private_mode(self.params[i], enable);
                }
            }
            return;
        }
        if self.private == b'>' {
            if final_byte == b'c' {
                self.replies.extend_from_slice(b"\x1b[>0;0;0c");
            }
            return;
        }
        if self.private != 0 {
            return;
        }
        if final_byte != b'b' {
            self.wrap_pending = false;
        }
        match final_byte {
            b'm' => self.sgr(),
            b'H' | b'f' => {
                self.grid.cursor.row = (self.param(0, 1) as usize - 1).min(rows - 1);
                self.grid.cursor.col = (self.param(1, 1) as usize - 1).min(cols - 1);
            }
            b'A' => {
                let top = if self.grid.cursor.row >= self.scroll_top {
                    self.scroll_top
                } else {
                    0
                };
                self.grid.cursor.row = self.grid.cursor.row.saturating_sub(self.count()).max(top);
            }
            b'B' | b'e' => {
                let bottom = if self.grid.cursor.row < self.scroll_bottom {
                    self.scroll_bottom
                } else {
                    rows
                };
                self.grid.cursor.row = (self.grid.cursor.row + self.count()).min(bottom - 1);
            }
            b'C' | b'a' => {
                self.grid.cursor.col = (self.grid.cursor.col + self.count()).min(cols - 1)
            }
            b'D' => self.grid.cursor.col = self.grid.cursor.col.saturating_sub(self.count()),
            b'E' => {
                self.grid.cursor.row = (self.grid.cursor.row + self.count()).min(rows - 1);
                self.grid.cursor.col = 0;
            }
            b'F' => {
                self.grid.cursor.row = self.grid.cursor.row.saturating_sub(self.count());
                self.grid.cursor.col = 0;
            }
            b'G' | b'`' => self.grid.cursor.col = (self.param(0, 1) as usize - 1).min(cols - 1),
            b'd' => self.grid.cursor.row = (self.param(0, 1) as usize - 1).min(rows - 1),
            b'J' => self.erase_display(self.param(0, 0)),
            b'K' => self.erase_line(self.param(0, 0)),
            b'X' => {
                let Cursor { col, row, .. } = self.grid.cursor;
                let fill = self.blank();
                self.grid.fill_row(row, col, col + self.count(), fill);
            }
            b'P' => {
                let Cursor { col, row, .. } = self.grid.cursor;
                let fill = self.blank();
                self.grid.delete_chars(col, row, self.count(), fill);
            }
            b'@' => {
                let Cursor { col, row, .. } = self.grid.cursor;
                let fill = self.blank();
                self.grid.insert_chars(col, row, self.count(), fill);
            }
            b'S' => {
                let fill = self.blank();
                self.grid
                    .scroll_up(self.scroll_top, self.scroll_bottom, self.count(), fill);
            }
            b'T' => {
                let fill = self.blank();
                self.grid
                    .scroll_down(self.scroll_top, self.scroll_bottom, self.count(), fill);
            }
            b'L' | b'M' => {
                let row = self.grid.cursor.row;
                if row >= self.scroll_top && row < self.scroll_bottom {
                    let fill = self.blank();
                    if final_byte == b'L' {
                        self.grid
                            .scroll_down(row, self.scroll_bottom, self.count(), fill);
                    } else {
                        self.grid
                            .scroll_up(row, self.scroll_bottom, self.count(), fill);
                    }
                    self.grid.cursor.col = 0;
                }
            }
            b'b' => {
                if let Some(cp) = self.last_printed {
                    for _ in 0..self.count().min(cols * rows) {
                        self.print(cp);
                    }
                }
            }
            b'r' => {
                let top = self.param(0, 1) as usize - 1;
                let bottom = (self.param(1, rows as u32) as usize).min(rows);
                if top + 1 < bottom {
                    self.scroll_top = top;
                    self.scroll_bottom = bottom;
                    self.grid.cursor.col = 0;
                    self.grid.cursor.row = 0;
                }
            }
            b's' => self.save_cursor(),
            b'u' => self.restore_cursor(),
            b'n' => match self.param(0, 0) {
                5 => self.replies.extend_from_slice(b"\x1b[0n"),
                6 => {
                    let reply = format!(
                        "\x1b[{};{}R",
                        self.grid.cursor.row + 1,
                        self.grid.cursor.col + 1
                    );
                    self.replies.extend_from_slice(reply.as_bytes());
                }
                _ => {}
            },
            b'c' => {
                if self.param(0, 0) == 0 {
                    self.replies.extend_from_slice(b"\x1b[?6c");
                }
            }
            _ => {}
        }
    }

    fn set_private_mode(&mut self, mode: u32, enable: bool) {
        match mode {
            7 => self.autowrap = enable,
            25 => self.grid.cursor.visible = enable,
            47 | 1047 | 1049 => {
                if enable == self.grid.is_alternate() {
                    return;
                }
                if enable {
                    if mode == 1049 {
                        self.save_cursor();
                        self.alt_saved = Some(self.saved);
                    }
                    self.grid.enter_alternate();
                } else {
                    self.grid.leave_alternate();
                    if let Some(saved) = self.alt_saved.take() {
                        self.saved = saved;
                        self.restore_cursor();
                    }
                }
                self.wrap_pending = false;
            }
            _ => {}
        }
    }

    fn sgr(&mut self) {
        if self.nparams == 0 {
            self.pen = Pen::DEFAULT;
            return;
        }
        let n = self.nparams;
        let mut i = 0;
        while i < n {
            let p = self.params[i];
            // Sub-parameters (`4:3`, `38:2::r:g:b`) belong to the parameter before them.
            let mut group_end = i + 1;
            while group_end < n && self.colon[group_end] {
                group_end += 1;
            }
            let has_sub = group_end > i + 1;
            match p {
                0 => self.pen = Pen::DEFAULT,
                1 => self.pen.flags |= flags::BOLD,
                2 => self.pen.flags |= flags::DIM,
                3 => self.pen.flags |= flags::ITALIC,
                4 => {
                    if has_sub && self.params[i + 1] == 0 {
                        self.pen.flags &= !flags::UNDERLINE;
                    } else {
                        self.pen.flags |= flags::UNDERLINE;
                    }
                }
                5 | 6 => self.pen.flags |= flags::BLINK,
                7 => self.pen.flags |= flags::INVERSE,
                8 => self.pen.flags |= flags::INVISIBLE,
                9 => self.pen.flags |= flags::STRIKETHROUGH,
                21 => self.pen.flags |= flags::UNDERLINE,
                22 => self.pen.flags &= !(flags::BOLD | flags::DIM),
                23 => self.pen.flags &= !flags::ITALIC,
                24 => self.pen.flags &= !flags::UNDERLINE,
                25 => self.pen.flags &= !flags::BLINK,
                27 => self.pen.flags &= !flags::INVERSE,
                28 => self.pen.flags &= !flags::INVISIBLE,
                29 => self.pen.flags &= !flags::STRIKETHROUGH,
                30..=37 => self.pen.fg = palette(p - 30),
                39 => self.pen.fg = 0,
                40..=47 => self.pen.bg = palette(p - 40),
                49 => self.pen.bg = 0,
                90..=97 => self.pen.fg = palette(p - 90 + 8),
                100..=107 => self.pen.bg = palette(p - 100 + 8),
                38 | 48 => {
                    let (color, next) = if has_sub {
                        (
                            self.extended_color(&self.params[i + 1..group_end], true),
                            group_end,
                        )
                    } else {
                        self.extended_color_semicolon(i + 1)
                    };
                    if let Some(color) = color {
                        if p == 38 {
                            self.pen.fg = color;
                        } else {
                            self.pen.bg = color;
                        }
                    }
                    i = next;
                    continue;
                }
                _ => {}
            }
            i = group_end;
        }
    }

    /// `38;5;n` / `38;2;r;g;b`: returns the color and the index after the consumed parameters.
    fn extended_color_semicolon(&self, start: usize) -> (Option<u32>, usize) {
        let rest = &self.params[start.min(self.nparams)..self.nparams];
        match rest.first() {
            Some(&5) if rest.len() >= 2 => (self.extended_color(&rest[..2], false), start + 2),
            Some(&2) if rest.len() >= 4 => (self.extended_color(&rest[..4], false), start + 4),
            _ => (None, self.nparams),
        }
    }

    /// `[5, n]` or `[2, r, g, b]`; the colon form may carry a color-space id: `[2, id, r, g, b]`.
    fn extended_color(&self, args: &[u32], colon_form: bool) -> Option<u32> {
        match args {
            [5, n, ..] => Some(palette(*n)),
            [2, _, r, g, b, ..] if colon_form => Some(rgba(*r as u8, *g as u8, *b as u8)),
            [2, r, g, b, ..] => Some(rgba(*r as u8, *g as u8, *b as u8)),
            _ => None,
        }
    }

    fn blank(&self) -> Cell {
        Cell::erased(self.pen.bg)
    }

    fn erase_display(&mut self, mode: u32) {
        let Cursor { col, row, .. } = self.grid.cursor;
        let fill = self.blank();
        let (cols, rows) = (self.grid.cols(), self.grid.rows());
        match mode {
            0 => {
                self.grid.fill_row(row, col, cols, fill);
                for r in row + 1..rows {
                    self.grid.fill_row(r, 0, cols, fill);
                }
            }
            1 => {
                for r in 0..row {
                    self.grid.fill_row(r, 0, cols, fill);
                }
                self.grid.fill_row(row, 0, col + 1, fill);
            }
            2 => self.grid.clear(fill),
            3 => {
                self.grid.clear(fill);
                self.grid.clear_scrollback();
            }
            _ => {}
        }
    }

    fn erase_line(&mut self, mode: u32) {
        let Cursor { col, row, .. } = self.grid.cursor;
        let fill = self.blank();
        let cols = self.grid.cols();
        match mode {
            0 => self.grid.fill_row(row, col, cols, fill),
            1 => self.grid.fill_row(row, 0, col + 1, fill),
            2 => self.grid.fill_row(row, 0, cols, fill),
            _ => {}
        }
    }

    fn linefeed(&mut self) {
        self.wrap_pending = false;
        let row = self.grid.cursor.row;
        if row + 1 == self.scroll_bottom {
            let fill = self.blank();
            self.grid
                .scroll_up(self.scroll_top, self.scroll_bottom, 1, fill);
        } else if row + 1 < self.grid.rows() {
            self.grid.cursor.row += 1;
        }
    }

    fn reverse_index(&mut self) {
        self.wrap_pending = false;
        if self.grid.cursor.row == self.scroll_top {
            let fill = self.blank();
            self.grid
                .scroll_down(self.scroll_top, self.scroll_bottom, 1, fill);
        } else {
            self.grid.cursor.row = self.grid.cursor.row.saturating_sub(1);
        }
    }

    fn save_cursor(&mut self) {
        self.saved = Saved {
            col: self.grid.cursor.col,
            row: self.grid.cursor.row,
            pen: self.pen,
            wrap_pending: self.wrap_pending,
        };
    }

    fn restore_cursor(&mut self) {
        let s = self.saved;
        self.grid.cursor.col = s.col.min(self.grid.cols() - 1);
        self.grid.cursor.row = s.row.min(self.grid.rows() - 1);
        self.pen = s.pen;
        self.wrap_pending = s.wrap_pending;
    }

    fn full_reset(&mut self) {
        self.grid.leave_alternate();
        self.grid.clear(Cell::BLANK);
        self.grid.cursor = Cursor {
            col: 0,
            row: 0,
            visible: true,
        };
        self.pen = Pen::DEFAULT;
        self.autowrap = true;
        self.wrap_pending = false;
        self.alt_saved = None;
        self.scroll_top = 0;
        self.scroll_bottom = self.grid.rows();
        self.last_printed = None;
        self.title.clear();
        self.save_cursor();
    }

    /// Blanks the other half of a wide character that `col` is about to overwrite.
    fn break_wide(&mut self, col: usize, row: usize) {
        let cell = self.grid.get(col, row);
        if cell.flags & flags::WIDE_SPACER != 0 && col > 0 {
            self.grid
                .set(col - 1, row, Cell::erased(self.grid.get(col - 1, row).bg));
        } else if cell.flags & flags::WIDE != 0 && col + 1 < self.grid.cols() {
            self.grid
                .set(col + 1, row, Cell::erased(self.grid.get(col + 1, row).bg));
        }
    }

    fn print(&mut self, codepoint: u32) {
        let width = if codepoint < 0x7F {
            1
        } else {
            usize::from((self.width)(codepoint))
        };
        if width == 0 {
            return;
        }
        self.last_printed = Some(codepoint);
        let cols = self.grid.cols();
        let width = width.min(2).min(cols);

        if self.wrap_pending || self.grid.cursor.col + width > cols {
            if self.autowrap {
                if !self.wrap_pending {
                    let Cursor { col, row, .. } = self.grid.cursor;
                    let fill = self.blank();
                    self.grid.fill_row(row, col, cols, fill);
                }
                self.grid.cursor.col = 0;
                self.linefeed();
            } else {
                self.grid.cursor.col = cols - width;
            }
            self.wrap_pending = false;
        }

        let Cursor { col, row, .. } = self.grid.cursor;
        let Pen {
            fg,
            bg,
            flags: style,
        } = self.pen;
        self.break_wide(col, row);
        if width == 2 {
            self.break_wide(col + 1, row);
            self.grid.set(
                col,
                row,
                Cell {
                    codepoint,
                    fg,
                    bg,
                    flags: style | flags::WIDE,
                },
            );
            self.grid.set(
                col + 1,
                row,
                Cell {
                    codepoint: 0,
                    fg,
                    bg,
                    flags: style | flags::WIDE_SPACER,
                },
            );
        } else {
            self.grid.set(
                col,
                row,
                Cell {
                    codepoint,
                    fg,
                    bg,
                    flags: style,
                },
            );
        }

        if col + width >= cols {
            self.grid.cursor.col = cols - 1;
            self.wrap_pending = self.autowrap;
        } else {
            self.grid.cursor.col = col + width;
        }
    }
}

fn rgba(r: u8, g: u8, b: u8) -> u32 {
    (u32::from(r) << 24) | (u32::from(g) << 16) | (u32::from(b) << 8) | 0xFF
}

fn ansi_rgb(idx: u32) -> (u8, u8, u8) {
    match idx {
        0 => (0, 0, 0),
        1 => (205, 49, 49),
        2 => (13, 188, 121),
        3 => (229, 229, 16),
        4 => (36, 114, 200),
        5 => (188, 63, 188),
        6 => (17, 168, 205),
        7 => (229, 229, 229),
        _ => (255, 255, 255),
    }
}

/// xterm 256-color palette (0-15 ANSI, 16-231 color cube, 232-255 grays).
fn palette(index: u32) -> u32 {
    let (r, g, b) = if index < 8 {
        ansi_rgb(index)
    } else if index < 16 {
        let (r, g, b) = ansi_rgb(index - 8);
        (
            r.saturating_add(50),
            g.saturating_add(50),
            b.saturating_add(50),
        )
    } else if index < 232 {
        let v = index - 16;
        (
            ((v / 36) % 6 * 51) as u8,
            ((v / 6) % 6 * 51) as u8,
            (v % 6 * 51) as u8,
        )
    } else {
        let gray = (8 + (index.min(255) - 232) * 10) as u8;
        (gray, gray, gray)
    };
    rgba(r, g, b)
}
