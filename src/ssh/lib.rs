// SPDX-License-Identifier: Apache-2.0
//! `bun ssh`: SSH client, transfers, forwards, connection pool and server management.
//!
//! The system OpenSSH (Windows `System32\OpenSSH`, Git for Windows `usr/bin`, Linux/macOS
//! `/usr/bin`) is driven first, so `~/.ssh/config`, ssh-agent, ControlMaster, credential prompts
//! and `known_hosts` behave exactly as with `ssh`. The in-process `russh` client (moved from
//! aphrody's `aphrody-ssh` crate) takes over where no system binary exists, for the persistent
//! connection pool (Windows OpenSSH has no ControlMaster) and for the embedded test server.
//!
//! Secrets never travel through argv or logs: passphrases and passwords come from the
//! environment (`BUN_SSH_PASSPHRASE`, `BUN_SSH_PASSWORD`), `SSH_ASKPASS` or the agent.

// This crate runs on its own tokio runtime inside a CLI subcommand, outside bun's event loop,
// so it uses std/tokio I/O directly like the vendored uv crates.
#![allow(
    clippy::disallowed_methods,
    clippy::disallowed_types,
    clippy::disallowed_macros,
    clippy::needless_pass_by_value,
    clippy::large_enum_variant,
    clippy::large_stack_frames
)]

pub mod auth;
pub mod cli;
pub mod config;
pub mod forward;
pub mod keys;
pub mod known_hosts;
pub mod native;
pub mod rsync;
pub mod server;
pub mod system;
pub mod term;

pub use config::{Destination, HostConfig};

/// Errors of the SSH surface. Messages never contain secrets.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("ssh: {0}")]
    Ssh(#[from] russh::Error),
    #[error("ssh key: {0}")]
    Key(#[from] russh::keys::Error),
    #[error("sftp: {0}")]
    Sftp(#[from] russh_sftp::client::error::Error),
    #[error("rsync: {0}")]
    Rsync(#[from] rsync::RsyncError),
    #[error("invalid argument: {0}")]
    InvalidInput(String),
    #[error("host key verification failed for {host}: {reason}")]
    HostKey { host: String, reason: String },
    #[error("authentication failed for {user}@{host}")]
    Auth { user: String, host: String },
    #[error("timed out after {0}s")]
    Timeout(u64),
    #[error("{0}")]
    Other(String),
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

pub(crate) fn other(message: impl Into<String>) -> Error {
    Error::Other(message.into())
}

/// User home directory (`USERPROFILE` on Windows, `HOME` elsewhere).
pub fn home_dir() -> Option<std::path::PathBuf> {
    #[cfg(windows)]
    let var = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    #[cfg(not(windows))]
    let var = std::env::var_os("HOME");
    var.filter(|v| !v.is_empty()).map(std::path::PathBuf::from)
}

/// `~/.bun/ssh`, created on demand with owner-only permissions where the OS supports them.
pub fn state_dir() -> Result<std::path::PathBuf> {
    let dir = match std::env::var_os("BUN_SSH_STATE_DIR") {
        Some(dir) if !dir.is_empty() => std::path::PathBuf::from(dir),
        _ => home_dir()
            .ok_or_else(|| other("cannot resolve the home directory"))?
            .join(".bun")
            .join("ssh"),
    };
    std::fs::create_dir_all(&dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    Ok(dir)
}

/// Builds the multi-threaded runtime every async entry point of this crate runs on.
pub fn runtime() -> Result<tokio::runtime::Runtime> {
    Ok(tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .thread_name("bun-ssh")
        .enable_all()
        .build()?)
}

mod stdio {
    #[cfg(unix)]
    pub(crate) fn write_all(fd: i32, mut bytes: &[u8]) {
        while !bytes.is_empty() {
            // SAFETY: `bytes` is a live slice; fd 1/2 belong to the process.
            let n = unsafe { libc::write(fd, bytes.as_ptr().cast(), bytes.len()) };
            if n <= 0 {
                if n < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
                    continue;
                }
                return;
            }
            bytes = &bytes[n as usize..];
        }
    }

    #[cfg(unix)]
    pub(crate) fn read(buf: &mut [u8]) -> usize {
        loop {
            // SAFETY: `buf` is a live, writable slice.
            let n = unsafe { libc::read(0, buf.as_mut_ptr().cast(), buf.len()) };
            if n < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
                continue;
            }
            return usize::try_from(n).unwrap_or(0);
        }
    }

    #[cfg(windows)]
    pub(crate) fn write_all(which: u32, mut bytes: &[u8]) {
        use windows_sys::Win32::Storage::FileSystem::WriteFile;
        use windows_sys::Win32::System::Console::GetStdHandle;
        // SAFETY: the handle comes from GetStdHandle and `bytes` is a live slice.
        unsafe {
            let handle = GetStdHandle(which);
            while !bytes.is_empty() {
                let mut written = 0u32;
                let len = u32::try_from(bytes.len()).unwrap_or(u32::MAX);
                if WriteFile(handle, bytes.as_ptr(), len, &raw mut written, core::ptr::null_mut()) == 0 || written == 0 {
                    return;
                }
                bytes = &bytes[written as usize..];
            }
        }
    }

    #[cfg(windows)]
    pub(crate) fn read(buf: &mut [u8]) -> usize {
        use windows_sys::Win32::Storage::FileSystem::ReadFile;
        use windows_sys::Win32::System::Console::{GetStdHandle, STD_INPUT_HANDLE};
        let mut read = 0u32;
        let len = u32::try_from(buf.len()).unwrap_or(u32::MAX);
        // SAFETY: the handle comes from GetStdHandle and `buf` is a live, writable slice.
        let ok = unsafe { ReadFile(GetStdHandle(STD_INPUT_HANDLE), buf.as_mut_ptr(), len, &raw mut read, core::ptr::null_mut()) };
        if ok == 0 { 0 } else { read as usize }
    }

    #[cfg(unix)]
    pub(crate) const STDOUT: i32 = 1;
    #[cfg(unix)]
    pub(crate) const STDERR: i32 = 2;
    #[cfg(windows)]
    pub(crate) const STDOUT: u32 = windows_sys::Win32::System::Console::STD_OUTPUT_HANDLE;
    #[cfg(windows)]
    pub(crate) const STDERR: u32 = windows_sys::Win32::System::Console::STD_ERROR_HANDLE;
}

/// Writes to the process stdout without the standard library's stream machinery (see
/// `test/internal/source-lints/no-std-stdio.test.ts`).
pub fn write_stdout(bytes: &[u8]) {
    stdio::write_all(stdio::STDOUT, bytes);
}

pub fn write_stderr(bytes: &[u8]) {
    stdio::write_all(stdio::STDERR, bytes);
}

/// Reads the process stdin on a dedicated thread and forwards its chunks; `None` marks EOF.
pub fn stdin_chunks() -> tokio::sync::mpsc::Receiver<Option<Vec<u8>>> {
    let (tx, rx) = tokio::sync::mpsc::channel(16);
    std::thread::Builder::new()
        .name("bun-ssh-stdin".into())
        .spawn(move || {
            let mut buf = vec![0u8; 32 * 1024];
            loop {
                let n = stdio::read(&mut buf);
                if n == 0 {
                    let _ = tx.blocking_send(None);
                    break;
                }
                if tx.blocking_send(Some(buf[..n].to_vec())).is_err() {
                    break;
                }
            }
        })
        .ok();
    rx
}
