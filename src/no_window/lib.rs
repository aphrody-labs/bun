//! Child processes that never open a console window.
//!
//! Windows gives a console program started by a process without a console
//! (a service, a GUI, a detached process) a new console window. When the
//! parent is attached to a console the child shares it and no window appears,
//! even when that console has no window of its own (a pseudoconsole, or one
//! created hidden), so a window is only suppressed when the parent has no
//! console: `CREATE_NO_WINDOW` would also detach the child from an
//! interactive terminal, and makes Windows start a console host (conhost.exe)
//! for every child, about 10 ms each. Everywhere else this crate does nothing.
//!
//! Every first-party spawn goes through [`command`] or [`NoWindow`], or ORs
//! [`creation_flags`] into the flags of its own `CreateProcessW` call.

#![cfg_attr(not(feature = "std"), no_std)]
#![allow(clippy::disallowed_types)]

/// `CREATE_NO_WINDOW` (`winbase.h`).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(windows)]
mod win {
    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub(crate) fn GetConsoleProcessList(list: *mut u32, count: u32) -> u32;
    }
}

/// Whether this process is attached to a console that a child would share.
/// `GetConsoleWindow` is not the test: a pseudoconsole has no window.
#[cfg(windows)]
pub fn has_console() -> bool {
    let mut pid = 0u32;
    // SAFETY: `pid` is a one-element buffer; the call fails (0) without a console.
    unsafe { win::GetConsoleProcessList(&raw mut pid, 1) != 0 }
}

/// Whether this process is attached to a console that a child would share.
#[cfg(not(windows))]
pub fn has_console() -> bool {
    true
}

/// `dwCreationFlags` bits that keep a child from opening a console window:
/// `CREATE_NO_WINDOW` when this process has no console, else `0`.
#[cfg(windows)]
pub fn creation_flags() -> u32 {
    if has_console() {
        0
    } else {
        CREATE_NO_WINDOW
    }
}

/// `dwCreationFlags` bits that keep a child from opening a console window:
/// `CREATE_NO_WINDOW` when this process has no console, else `0`.
#[cfg(not(windows))]
pub fn creation_flags() -> u32 {
    0
}

#[cfg(feature = "std")]
pub use command::{NoWindow, command};

#[cfg(feature = "std")]
mod command {
    use std::ffi::OsStr;
    use std::process::Command;

    /// A [`Command`] that opens no console window, see [`NoWindow::no_window`].
    pub fn command<S: AsRef<OsStr>>(program: S) -> Command {
        let mut command = Command::new(program);
        command.no_window();
        command
    }

    /// Opens no console window for the child of a [`Command`].
    pub trait NoWindow {
        /// Adds [`creation_flags`](crate::creation_flags). `creation_flags` of
        /// `CommandExt` replaces the previous value, so a command that sets its
        /// own flags ORs `creation_flags()` into them instead of calling this.
        fn no_window(&mut self) -> &mut Self;
    }

    impl NoWindow for Command {
        #[cfg(windows)]
        fn no_window(&mut self) -> &mut Self {
            use std::os::windows::process::CommandExt;
            match crate::creation_flags() {
                0 => self,
                flags => self.creation_flags(flags),
            }
        }

        #[cfg(not(windows))]
        fn no_window(&mut self) -> &mut Self {
            self
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn command_keeps_program_and_args() {
            let mut cmd = command("echo");
            cmd.arg("a");
            assert_eq!(cmd.get_program(), "echo");
            assert_eq!(cmd.get_args().collect::<Vec<_>>(), ["a"]);
        }

        #[test]
        fn flags_follow_the_console() {
            assert_eq!(
                crate::creation_flags() == 0,
                crate::has_console() || !cfg!(windows)
            );
        }
    }
}
