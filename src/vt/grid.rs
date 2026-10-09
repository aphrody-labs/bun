// SPDX-License-Identifier: Apache-2.0
// Origin: aphrody-labs/aphrody crates/shell/aphrody-term/src/{cell,grid}.rs (Apache-2.0).

use std::collections::VecDeque;

/// Style bits of a cell; the values are part of the `Bun.TerminalScreen#cells()` layout.
pub mod flags {
    pub const BOLD: u32 = 1 << 0;
    pub const DIM: u32 = 1 << 1;
    pub const ITALIC: u32 = 1 << 2;
    pub const UNDERLINE: u32 = 1 << 3;
    pub const BLINK: u32 = 1 << 4;
    pub const INVERSE: u32 = 1 << 5;
    pub const INVISIBLE: u32 = 1 << 6;
    pub const STRIKETHROUGH: u32 = 1 << 7;
    /// Left half of a two-column character.
    pub const WIDE: u32 = 1 << 8;
    /// Right half of a two-column character (codepoint 0).
    pub const WIDE_SPACER: u32 = 1 << 9;
}

/// One screen cell. Colors are `0xRRGGBBAA`; `0` means the terminal default color.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Cell {
    pub codepoint: u32,
    pub fg: u32,
    pub bg: u32,
    pub flags: u32,
}

impl Cell {
    pub(crate) const BLANK: Cell = Cell {
        codepoint: b' ' as u32,
        fg: 0,
        bg: 0,
        flags: 0,
    };

    /// A blank cell that keeps the current background (erase operations use it).
    pub(crate) fn erased(bg: u32) -> Cell {
        Cell { bg, ..Cell::BLANK }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) struct Cursor {
    pub(crate) col: usize,
    pub(crate) row: usize,
    pub(crate) visible: bool,
}

/// The visible cells, the rows that scrolled off the top, and the parked
/// primary screen while the alternate screen is active.
pub(crate) struct Grid {
    cols: usize,
    rows: usize,
    cells: Vec<Cell>,
    scrollback: VecDeque<Vec<Cell>>,
    max_scrollback: usize,
    primary: Option<Vec<Cell>>,
    pub(crate) cursor: Cursor,
}

impl Grid {
    pub(crate) fn new(cols: usize, rows: usize, max_scrollback: usize) -> Grid {
        let cols = cols.max(1);
        let rows = rows.max(1);
        Grid {
            cols,
            rows,
            cells: vec![Cell::BLANK; cols * rows],
            scrollback: VecDeque::new(),
            max_scrollback,
            primary: None,
            cursor: Cursor {
                col: 0,
                row: 0,
                visible: true,
            },
        }
    }

    pub(crate) fn cols(&self) -> usize {
        self.cols
    }

    pub(crate) fn rows(&self) -> usize {
        self.rows
    }

    pub(crate) fn cells(&self) -> &[Cell] {
        &self.cells
    }

    pub(crate) fn scrollback(&self) -> &VecDeque<Vec<Cell>> {
        &self.scrollback
    }

    pub(crate) fn clear_scrollback(&mut self) {
        self.scrollback.clear();
    }

    pub(crate) fn is_alternate(&self) -> bool {
        self.primary.is_some()
    }

    pub(crate) fn get(&self, col: usize, row: usize) -> Cell {
        self.cells[row * self.cols + col]
    }

    pub(crate) fn set(&mut self, col: usize, row: usize, cell: Cell) {
        if col < self.cols && row < self.rows {
            self.cells[row * self.cols + col] = cell;
        }
    }

    pub(crate) fn row(&self, row: usize) -> &[Cell] {
        &self.cells[row * self.cols..(row + 1) * self.cols]
    }

    /// Fills `[from, to)` of `row` with `cell`.
    pub(crate) fn fill_row(&mut self, row: usize, from: usize, to: usize, cell: Cell) {
        if row >= self.rows {
            return;
        }
        let to = to.min(self.cols);
        if from < to {
            let start = row * self.cols;
            self.cells[start + from..start + to].fill(cell);
        }
    }

    pub(crate) fn clear(&mut self, cell: Cell) {
        self.cells.fill(cell);
    }

    /// Scrolls rows `[top, bottom)` up by `count`. Evicted rows go to the
    /// scrollback when the region starts at the top of the primary screen.
    pub(crate) fn scroll_up(&mut self, top: usize, bottom: usize, count: usize, fill: Cell) {
        let bottom = bottom.min(self.rows);
        if top >= bottom {
            return;
        }
        let count = count.min(bottom - top);
        if count == 0 {
            return;
        }
        if top == 0 && self.primary.is_none() && self.max_scrollback > 0 {
            for r in 0..count {
                if self.scrollback.len() == self.max_scrollback {
                    self.scrollback.pop_front();
                }
                self.scrollback.push_back(self.row(r).to_vec());
            }
        }
        let c = self.cols;
        self.cells
            .copy_within((top + count) * c..bottom * c, top * c);
        self.cells[(bottom - count) * c..bottom * c].fill(fill);
    }

    /// Scrolls rows `[top, bottom)` down by `count`; rows pushed past `bottom` are dropped.
    pub(crate) fn scroll_down(&mut self, top: usize, bottom: usize, count: usize, fill: Cell) {
        let bottom = bottom.min(self.rows);
        if top >= bottom {
            return;
        }
        let count = count.min(bottom - top);
        if count == 0 {
            return;
        }
        let c = self.cols;
        self.cells
            .copy_within(top * c..(bottom - count) * c, (top + count) * c);
        self.cells[top * c..(top + count) * c].fill(fill);
    }

    /// Removes `count` cells at `col`, shifting the rest of the row left.
    pub(crate) fn delete_chars(&mut self, col: usize, row: usize, count: usize, fill: Cell) {
        if col >= self.cols || row >= self.rows {
            return;
        }
        let start = row * self.cols;
        let line = &mut self.cells[start..start + self.cols];
        let count = count.min(self.cols - col);
        line.copy_within(col + count.., col);
        line[self.cols - count..].fill(fill);
    }

    /// Inserts `count` copies of `fill` at `col`, shifting the rest of the row right.
    pub(crate) fn insert_chars(&mut self, col: usize, row: usize, count: usize, fill: Cell) {
        if col >= self.cols || row >= self.rows {
            return;
        }
        let start = row * self.cols;
        let line = &mut self.cells[start..start + self.cols];
        let count = count.min(self.cols - col);
        line.copy_within(col..self.cols - count, col + count);
        line[col..col + count].fill(fill);
    }

    /// Parks the primary screen and shows a blank alternate screen.
    pub(crate) fn enter_alternate(&mut self) {
        if self.primary.is_none() {
            let blank = vec![Cell::BLANK; self.cols * self.rows];
            self.primary = Some(core::mem::replace(&mut self.cells, blank));
        }
    }

    /// Drops the alternate screen and restores the primary one.
    pub(crate) fn leave_alternate(&mut self) {
        if let Some(primary) = self.primary.take() {
            self.cells = primary;
        }
    }

    /// Changes the visible size, keeping the top-left corner of the content.
    /// When the screen shrinks below the cursor, the top rows move to the
    /// scrollback so the cursor row stays visible.
    pub(crate) fn resize(&mut self, cols: usize, rows: usize) {
        let cols = cols.max(1);
        let rows = rows.max(1);
        if cols == self.cols && rows == self.rows {
            return;
        }
        if self.cursor.row >= rows {
            let n = self.cursor.row + 1 - rows;
            self.scroll_up(0, self.rows, n, Cell::BLANK);
            self.cursor.row -= n;
        }
        self.cells = resize_cells(&self.cells, self.cols, self.rows, cols, rows);
        if let Some(primary) = &self.primary {
            self.primary = Some(resize_cells(primary, self.cols, self.rows, cols, rows));
        }
        self.cols = cols;
        self.rows = rows;
        self.cursor.col = self.cursor.col.min(cols - 1);
        self.cursor.row = self.cursor.row.min(rows - 1);
    }
}

fn resize_cells(
    cells: &[Cell],
    cols: usize,
    rows: usize,
    new_cols: usize,
    new_rows: usize,
) -> Vec<Cell> {
    let mut out = vec![Cell::BLANK; new_cols * new_rows];
    let keep_cols = cols.min(new_cols);
    for r in 0..rows.min(new_rows) {
        out[r * new_cols..r * new_cols + keep_cols]
            .copy_from_slice(&cells[r * cols..r * cols + keep_cols]);
    }
    out
}

/// Appends the text of `row` as UTF-8, trailing blanks trimmed, wide-character spacers skipped.
pub(crate) fn push_row_text(out: &mut Vec<u8>, row: &[Cell]) {
    let end = row
        .iter()
        .rposition(|c| c.codepoint != b' ' as u32 && c.flags & flags::WIDE_SPACER == 0)
        .map_or(0, |i| i + 1);
    let mut utf8 = [0u8; 4];
    for cell in &row[..end] {
        if cell.flags & flags::WIDE_SPACER != 0 {
            continue;
        }
        let ch = char::from_u32(cell.codepoint).unwrap_or(' ');
        out.extend_from_slice(ch.encode_utf8(&mut utf8).as_bytes());
    }
}
