# bun_vt

Headless VT100/xterm screen: a cell grid with scrollback, cursor, alternate
screen and scroll region, fed with the raw bytes a program writes to its
terminal. No dependencies, no I/O. It backs `Bun.TerminalScreen` in the
[Aphrody fork of Bun](https://github.com/aphrody-labs/bun).

```rust
use bun_vt::Screen;

// Character width is supplied by the caller (0 for combining marks, 2 for wide cells).
fn width(cp: u32) -> u8 {
    if (0x1100..=0x115F).contains(&cp) { 2 } else { 1 }
}

// columns, rows, scrollback lines, convert LF to CRLF, width function
let mut screen = Screen::new(80, 24, 1000, false, width);
screen.write(b"hello\r\n\x1b[31mworld\x1b[0m");
assert_eq!(screen.text(false), b"hello\nworld");
assert_eq!(screen.cursor(), (5, 1, true));
```

License: Apache-2.0.
