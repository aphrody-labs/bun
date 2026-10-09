// SPDX-License-Identifier: Apache-2.0
//! Local terminal size and raw mode for PTY sessions (termios on Unix, console modes with
//! virtual-terminal input and output on Windows, the ConPTY-compatible path).

/// `(columns, rows)` of the terminal attached to stdout.
#[cfg(unix)]
pub fn size() -> Option<(u16, u16)> {
    // SAFETY: `winsize` is plain data and `ioctl(TIOCGWINSZ)` only writes into it.
    unsafe {
        let mut ws: libc::winsize = core::mem::zeroed();
        for fd in [libc::STDOUT_FILENO, libc::STDIN_FILENO, libc::STDERR_FILENO] {
            if libc::ioctl(fd, libc::TIOCGWINSZ, &mut ws) == 0 && ws.ws_col > 0 {
                return Some((ws.ws_col, ws.ws_row));
            }
        }
    }
    None
}

#[cfg(windows)]
pub fn size() -> Option<(u16, u16)> {
    use windows_sys::Win32::System::Console::{CONSOLE_SCREEN_BUFFER_INFO, GetConsoleScreenBufferInfo, GetStdHandle, STD_OUTPUT_HANDLE};
    // SAFETY: the handle comes from GetStdHandle and the info struct is plain data.
    unsafe {
        let mut info: CONSOLE_SCREEN_BUFFER_INFO = core::mem::zeroed();
        if GetConsoleScreenBufferInfo(GetStdHandle(STD_OUTPUT_HANDLE), &raw mut info) == 0 {
            return None;
        }
        let cols = info.srWindow.Right - info.srWindow.Left + 1;
        let rows = info.srWindow.Bottom - info.srWindow.Top + 1;
        Some((u16::try_from(cols).ok()?, u16::try_from(rows).ok()?))
    }
}

/// Raw mode for the lifetime of the value; the previous mode is restored on drop.
pub struct RawMode {
    #[cfg(unix)]
    saved: libc::termios,
    #[cfg(windows)]
    saved: (u32, u32),
}

impl RawMode {
    /// Returns `None` when stdin is not a terminal.
    #[cfg(unix)]
    pub fn enable() -> Option<Self> {
        // SAFETY: termios is plain data; the calls only read/write it for fd 0.
        unsafe {
            if libc::isatty(libc::STDIN_FILENO) == 0 {
                return None;
            }
            let mut saved: libc::termios = core::mem::zeroed();
            if libc::tcgetattr(libc::STDIN_FILENO, &mut saved) != 0 {
                return None;
            }
            let mut raw = saved;
            libc::cfmakeraw(&mut raw);
            if libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &raw) != 0 {
                return None;
            }
            Some(Self { saved })
        }
    }

    #[cfg(windows)]
    pub fn enable() -> Option<Self> {
        use windows_sys::Win32::System::Console::{
            ENABLE_ECHO_INPUT, ENABLE_LINE_INPUT, ENABLE_PROCESSED_INPUT, ENABLE_VIRTUAL_TERMINAL_INPUT,
            ENABLE_VIRTUAL_TERMINAL_PROCESSING, GetConsoleMode, GetStdHandle, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
            SetConsoleMode,
        };
        // SAFETY: handles come from GetStdHandle; the modes are plain integers.
        unsafe {
            let input = GetStdHandle(STD_INPUT_HANDLE);
            let output = GetStdHandle(STD_OUTPUT_HANDLE);
            let (mut in_mode, mut out_mode) = (0u32, 0u32);
            if GetConsoleMode(input, &raw mut in_mode) == 0 {
                return None;
            }
            GetConsoleMode(output, &raw mut out_mode);
            let raw_in = (in_mode & !(ENABLE_ECHO_INPUT | ENABLE_LINE_INPUT | ENABLE_PROCESSED_INPUT)) | ENABLE_VIRTUAL_TERMINAL_INPUT;
            if SetConsoleMode(input, raw_in) == 0 {
                return None;
            }
            SetConsoleMode(output, out_mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
            Some(Self { saved: (in_mode, out_mode) })
        }
    }
}

impl Drop for RawMode {
    fn drop(&mut self) {
        #[cfg(unix)]
        // SAFETY: restores the termios captured in `enable`.
        unsafe {
            libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &self.saved);
        }
        #[cfg(windows)]
        // SAFETY: restores the console modes captured in `enable`.
        unsafe {
            use windows_sys::Win32::System::Console::{GetStdHandle, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, SetConsoleMode};
            SetConsoleMode(GetStdHandle(STD_INPUT_HANDLE), self.saved.0);
            SetConsoleMode(GetStdHandle(STD_OUTPUT_HANDLE), self.saved.1);
        }
    }
}
