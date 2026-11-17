// SPDX-License-Identifier: Apache-2.0
// Origin: aphrody-labs/aphrody crates/shell/aphrody-term (Apache-2.0), grid and VT parser.
//! Headless VT100/xterm screen behind `Bun.TerminalScreen`: a cell grid with
//! scrollback, cursor, alternate screen and scroll region, fed with the raw
//! bytes a program writes to its terminal.

mod grid;
mod screen;

pub use grid::{Cell, flags};
pub use screen::{Screen, WidthFn};

#[cfg(test)]
mod tests {
    use super::*;

    fn width(cp: u32) -> u8 {
        match cp {
            0x300..=0x36F => 0,
            0x1100..=0x115F
            | 0x2E80..=0xA4CF
            | 0xAC00..=0xD7A3
            | 0xF900..=0xFAFF
            | 0xFF00..=0xFF60
            | 0x1F300..=0x1FAFF => 2,
            _ => 1,
        }
    }

    fn screen(cols: usize, rows: usize) -> Screen {
        Screen::new(cols, rows, 100, false, width)
    }

    fn text(s: &Screen) -> std::string::String {
        let bytes = s.text(false);
        core::str::from_utf8(&bytes).unwrap().to_owned()
    }

    fn cell(s: &Screen, col: usize, row: usize) -> Cell {
        s.cells()[row * s.cols() + col]
    }

    #[test]
    fn prints_and_moves_cursor() {
        let mut s = screen(10, 3);
        s.write(b"hello\r\nworld");
        assert_eq!(text(&s), "hello\nworld");
        assert_eq!(s.cursor(), (5, 1, true));
    }

    #[test]
    fn lf_without_cr_keeps_column_unless_convert_eol() {
        let mut s = screen(10, 3);
        s.write(b"ab\ncd");
        assert_eq!(text(&s), "ab\n  cd");
        let mut s = Screen::new(10, 3, 0, true, width);
        s.write(b"ab\ncd");
        assert_eq!(text(&s), "ab\ncd");
    }

    #[test]
    fn escape_and_utf8_split_across_writes() {
        let mut s = screen(10, 2);
        s.write(b"\x1b[3");
        s.write(b"1mA\xc3");
        s.write(b"\xa9");
        assert_eq!(text(&s), "A\u{e9}");
        assert_eq!(cell(&s, 0, 0).fg, 0xCD3131FF);
        assert_eq!(cell(&s, 1, 0).fg, 0xCD3131FF);
    }

    #[test]
    fn sgr_colors_and_flags() {
        let mut s = screen(10, 1);
        s.write(b"\x1b[1;4;38;2;1;2;3;48;5;196mX\x1b[0mY\x1b[38:2::9:8:7;91mZ");
        let x = cell(&s, 0, 0);
        assert_eq!(x.flags, flags::BOLD | flags::UNDERLINE);
        assert_eq!(x.fg, 0x010203FF);
        assert_eq!(x.bg, 0xFF0000FF);
        assert_eq!(
            cell(&s, 1, 0),
            Cell {
                codepoint: u32::from(b'Y'),
                fg: 0,
                bg: 0,
                flags: 0
            }
        );
        assert_eq!(cell(&s, 2, 0).fg, 0xFF6363FF);
        s.write(b"\x1b[38:2::9:8:7mW");
        assert_eq!(cell(&s, 3, 0).fg, 0x090807FF);
    }

    #[test]
    fn wraps_and_scrolls_into_scrollback() {
        let mut s = screen(4, 2);
        s.write(b"abcdefghij");
        assert_eq!(text(&s), "efgh\nij");
        let all = s.text(true);
        assert_eq!(core::str::from_utf8(&all).unwrap(), "abcd\nefgh\nij");
    }

    #[test]
    fn pending_wrap_at_last_column() {
        let mut s = screen(4, 2);
        s.write(b"abcd");
        assert_eq!(s.cursor(), (3, 0, true));
        s.write(b"\r\n");
        assert_eq!(s.cursor(), (0, 1, true));
        assert_eq!(text(&s), "abcd");
    }

    #[test]
    fn erase_and_cursor_movement() {
        let mut s = screen(6, 3);
        s.write(b"aaaaaa\r\nbbbbbb\r\ncccccc");
        s.write(b"\x1b[2;3H\x1b[K");
        assert_eq!(text(&s), "aaaaaa\nbb\ncccccc");
        s.write(b"\x1b[1J");
        assert_eq!(text(&s), "\n\ncccccc");
        s.write(b"\x1b[3;2H\x1b[2X\x1b[1P");
        assert_eq!(text(&s), "\n\nc ccc");
        s.write(b"\x1b[2J\x1b[Hx\x1b[5Gy\x1b[3dz");
        assert_eq!(text(&s), "x   y\n\n     z");
    }

    #[test]
    fn insert_delete_lines_in_scroll_region() {
        let mut s = screen(3, 4);
        s.write(b"1\r\n2\r\n3\r\n4");
        s.write(b"\x1b[2;3r\x1b[2;1H\x1b[L");
        assert_eq!(text(&s), "1\n\n2\n4");
        s.write(b"\x1b[M");
        assert_eq!(text(&s), "1\n2\n\n4");
        s.write(b"\x1b[3;1Hx\ny\nz");
        assert_eq!(text(&s), "1\n y\n  z\n4");
    }

    #[test]
    fn alternate_screen_restores_primary_and_cursor() {
        let mut s = screen(5, 2);
        s.write(b"main");
        s.write(b"\x1b[?1049h");
        assert!(s.is_alternate_screen());
        assert_eq!(text(&s), "");
        s.write(b"\x1b[Halt");
        s.write(b"\x1b[?1049l");
        assert!(!s.is_alternate_screen());
        assert_eq!(text(&s), "main");
        assert_eq!(s.cursor(), (4, 0, true));
    }

    #[test]
    fn wide_characters_take_two_cells() {
        let mut s = screen(5, 2);
        s.write("a\u{4e2d}b".as_bytes());
        assert_eq!(cell(&s, 1, 0).flags, flags::WIDE);
        assert_eq!(cell(&s, 2, 0).flags, flags::WIDE_SPACER);
        assert_eq!(s.cursor().0, 4);
        assert_eq!(text(&s), "a\u{4e2d}b");
        s.write("\x1b[1;3Hx".as_bytes());
        assert_eq!(text(&s), "a xb");
        s.write("\x1b[1;5H\u{4e2d}".as_bytes());
        assert_eq!(text(&s), "a xb\n\u{4e2d}");
    }

    #[test]
    fn replies_to_queries() {
        let mut s = screen(10, 5);
        s.write(b"\x1b[3;4H\x1b[6n\x1b[5n\x1b[c");
        assert_eq!(s.take_replies(), b"\x1b[3;4R\x1b[0n\x1b[?6c");
        assert!(s.take_replies().is_empty());
    }

    #[test]
    fn osc_title_and_ignored_strings() {
        let mut s = screen(10, 1);
        s.write(b"\x1b]0;my title\x07\x1bPq#0\x1b\\\x1b]8;;http://x\x1b\\ok\x1b(B");
        assert_eq!(s.title(), b"my title");
        assert_eq!(text(&s), "ok");
    }

    #[test]
    fn save_restore_cursor_and_hide() {
        let mut s = screen(10, 3);
        s.write(b"\x1b[2;5H\x1b7\x1b[H\x1b8X\x1b[?25l");
        assert_eq!(text(&s), "\n    X");
        assert!(!s.cursor().2);
    }

    #[test]
    fn resize_keeps_cursor_row_visible() {
        let mut s = screen(5, 4);
        s.write(b"1\r\n2\r\n3\r\n4");
        s.resize(3, 2);
        assert_eq!(text(&s), "3\n4");
        assert_eq!(s.cursor(), (1, 1, true));
        assert_eq!(core::str::from_utf8(&s.text(true)).unwrap(), "1\n2\n3\n4");
    }

    #[test]
    fn oversized_and_malformed_input_is_bounded() {
        let mut s = screen(4, 2);
        s.write(b"\x1b[99999999999999@\x1b[999999999b\x1b[;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;mA\xff\xc3(");
        assert_eq!(text(&s), "A\u{fffd}\u{fffd}(");
    }
}
