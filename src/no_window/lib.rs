//! Child processes that never open a console window.
//!
//! Windows gives a console program started by a process without a console
//! (a service, a scheduled task, a GUI, a detached or hidden process) a new
//! console window. When the parent has a console the child shares it and no
//! window appears, so a window is only suppressed when the parent has none:
//! `CREATE_NO_WINDOW` would also detach the child from an interactive
//! terminal. Everywhere else this crate does nothing.
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
    use core::ffi::c_void;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub(crate) safe fn GetConsoleWindow() -> *mut c_void;
    }
}

/// Whether this process owns a console window that a child would share.
#[cfg(windows)]
pub fn has_console_window() -> bool {
    !win::GetConsoleWindow().is_null()
}

/// Whether this process owns a console window that a child would share.
#[cfg(not(windows))]
pub fn has_console_window() -> bool {
    true
}

/// `dwCreationFlags` bits that keep a child from opening a console window:
/// `CREATE_NO_WINDOW` when this process has no console window, else `0`.
#[cfg(windows)]
pub fn creation_flags() -> u32 {
    if has_console_window() { 0 } else { CREATE_NO_WINDOW }
}

/// `dwCreationFlags` bits that keep a child from opening a console window:
/// `CREATE_NO_WINDOW` when this process has no console window, else `0`.
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
            assert_eq!(crate::creation_flags() == 0, crate::has_console_window() || !cfg!(windows));
        }
    }
}
