//! Chrome's `--remote-debugging-pipe` transport: commands arrive on fd 3, replies and events
//! leave on fd 4, each message a JSON text terminated by `\0`. Bun sets both up
//! (ChromeProcess.rs: a socketpair dup'd to 3 and 4 on POSIX, two CRT-inherited pipes on Windows).
//! `--stdio` swaps in stdin/stdout for manual runs and tests.

use std::io::{BufRead, BufReader, Read, Write};
use std::sync::mpsc;

pub enum Inbound {
    Message(String),
    /// Parent closed its end or died.
    Eof,
}

/// `(reader, writer)` of the pipe the parent gave us.
pub fn open(stdio: bool) -> std::io::Result<(Box<dyn Read + Send>, Box<dyn Write + Send>)> {
    if stdio {
        return Ok((Box::new(std::io::stdin()), Box::new(std::io::stdout())));
    }
    sys::fds()
}

/// Reader thread: splits on NUL and forwards each message to `dispatch`, then `Eof`.
pub fn spawn_reader(input: Box<dyn Read + Send>, dispatch: impl Fn(Inbound) + Send + 'static) {
    std::thread::Builder::new()
        .name("cdp-pipe-read".into())
        .spawn(move || {
            let mut r = BufReader::with_capacity(64 * 1024, input);
            let mut buf = Vec::new();
            loop {
                buf.clear();
                match r.read_until(0, &mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        if buf.last() == Some(&0) {
                            buf.pop();
                        }
                        if !buf.is_empty() {
                            dispatch(Inbound::Message(String::from_utf8_lossy(&buf).into_owned()));
                        }
                    }
                }
            }
            dispatch(Inbound::Eof);
        })
        .expect("spawn cdp reader");
}

/// Writer thread: one `\0`-terminated message per received string. Exits when every sender is dropped.
pub fn spawn_writer(mut output: Box<dyn Write + Send>) -> mpsc::Sender<String> {
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::Builder::new()
        .name("cdp-pipe-write".into())
        .spawn(move || {
            for msg in rx {
                if output.write_all(msg.as_bytes()).and_then(|()| output.write_all(b"\0")).and_then(|()| output.flush()).is_err() {
                    break;
                }
            }
        })
        .expect("spawn cdp writer");
    tx
}

#[cfg(unix)]
mod sys {
    use std::io::{Read, Write};
    use std::os::fd::FromRawFd;

    pub fn fds() -> std::io::Result<(Box<dyn Read + Send>, Box<dyn Write + Send>)> {
        // SAFETY: fcntl(F_GETFD) only probes whether the descriptor is open.
        let open = |fd| unsafe { libc_fcntl(fd) } != -1;
        if !open(3) || !open(4) {
            return Err(std::io::Error::other("fd 3/4 are not open: run under Bun.WebView or pass --stdio"));
        }
        // SAFETY: 3 and 4 were handed to us by the parent and nothing else in this process owns them.
        let (r, w) = unsafe { (std::fs::File::from_raw_fd(3), std::fs::File::from_raw_fd(4)) };
        Ok((Box::new(r), Box::new(w)))
    }

    unsafe extern "C" {
        fn fcntl(fd: i32, cmd: i32, ...) -> i32;
    }

    unsafe fn libc_fcntl(fd: i32) -> i32 {
        const F_GETFD: i32 = 1;
        // SAFETY: F_GETFD takes no third argument.
        unsafe { fcntl(fd, F_GETFD) }
    }
}

#[cfg(windows)]
mod sys {
    use std::io::{Read, Write};
    use std::os::windows::io::FromRawHandle;

    // UCRT: the CRT fd table is rebuilt at startup from STARTUPINFO.lpReserved2, which is how
    // libuv (Bun's spawn) passes extra stdio slots 3 and 4. Chrome reads them the same way.
    unsafe extern "C" {
        fn _get_osfhandle(fd: i32) -> isize;
    }

    pub fn fds() -> std::io::Result<(Box<dyn Read + Send>, Box<dyn Write + Send>)> {
        // SAFETY: _get_osfhandle only reads the CRT fd table; -1/-2 mean "not open".
        let (r, w) = unsafe { (_get_osfhandle(3), _get_osfhandle(4)) };
        if r == -1 || r == -2 || w == -1 || w == -2 {
            return Err(std::io::Error::other("CRT fds 3/4 are not open: run under Bun.WebView or pass --stdio"));
        }
        // SAFETY: inherited pipe handles owned by this process from here on.
        let (r, w) = unsafe { (std::fs::File::from_raw_handle(r as _), std::fs::File::from_raw_handle(w as _)) };
        Ok((Box::new(r), Box::new(w)))
    }
}
