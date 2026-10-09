//! What the terminal on stderr can do beyond SGR colors, detected once from
//! the environment (never by querying the terminal), and the escape
//! sequences Bun writes when it can: OSC 8 hyperlinks, OSC 9;4 progress and
//! DECSET 2026 synchronized output.
//!
//! [`emulator`] identifies the terminal from its environment variables only.
//! [`capabilities`] is what Bun may emit on stderr: nothing when stderr is not
//! a TTY, under CI, inside a multiplexer or on an unidentified terminal.
//! `BUN_TERMINAL_FEATURES=0` turns everything off, `=1` forces everything on;
//! `FORCE_HYPERLINK` forces hyperlinks alone, as in `supports-hyperlinks`.

use core::fmt::{self, Write as _};
use core::sync::atomic::{AtomicBool, Ordering};

use crate::{Once, env_var, output, strings};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Emulator {
    Unknown,
    WindowsTerminal,
    ConEmu,
    Vte,
    Ghostty,
    Kitty,
    WezTerm,
    Rio,
    /// Alacritty and COSMIC Terminal, which embeds its `alacritty_terminal`
    /// and sets the same variables.
    Alacritty,
    ITerm2,
    VsCode,
}

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct Images {
    pub sixel: bool,
    pub kitty: bool,
    pub iterm2: bool,
}

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
pub struct Capabilities {
    pub truecolor: bool,
    /// OSC 8.
    pub hyperlinks: bool,
    /// OSC 9;4, from ConEmu.
    pub progress: bool,
    /// OSC 9, OSC 99 or OSC 777 desktop notifications.
    pub notifications: bool,
    pub images: Images,
    /// DECSET 2026.
    pub synchronized_output: bool,
}

#[derive(Clone, Copy)]
pub struct Detected {
    pub emulator: Emulator,
    pub capabilities: Capabilities,
    /// Inside tmux, screen or zellij: the variables above describe the outer
    /// terminal, which the multiplexer stands between.
    pub multiplexed: bool,
}

const ALL: Capabilities = Capabilities {
    truecolor: true,
    hyperlinks: true,
    progress: true,
    notifications: false,
    images: Images {
        sixel: false,
        kitty: false,
        iterm2: false,
    },
    synchronized_output: true,
};

static EMULATOR: Once<Detected> = Once::new();
static CAPABILITIES: Once<Capabilities> = Once::new();

/// The terminal named by the environment, and what it supports.
pub fn emulator() -> Detected {
    *EMULATOR.get_or_init(detect_emulator)
}

/// What Bun may write to stderr.
pub fn capabilities() -> Capabilities {
    *CAPABILITIES.get_or_init(compute_capabilities)
}

pub fn hyperlinks() -> bool {
    capabilities().hyperlinks
}

pub fn progress() -> bool {
    capabilities().progress
}

pub fn synchronized_output() -> bool {
    capabilities().synchronized_output
}

fn var(name: &crate::ZStr) -> Option<&'static [u8]> {
    crate::getenv_z(name)
}

fn eq_ignore_case(a: &[u8], b: &[u8]) -> bool {
    a.eq_ignore_ascii_case(b)
}

/// `VTE_VERSION` is `major * 10000 + minor * 100 + micro` without the
/// leading `0.`: 0.76.2 is `7602`.
fn vte_version() -> u32 {
    var(crate::zstr!("VTE_VERSION"))
        .and_then(|v| core::str::from_utf8(v).ok())
        .and_then(|v| v.trim().parse().ok())
        .unwrap_or(0)
}

/// `TERM_PROGRAM_VERSION` as `(major, minor, patch)`; zeros when unset.
fn term_program_version() -> (u32, u32, u32) {
    let v = var(crate::zstr!("TERM_PROGRAM_VERSION")).unwrap_or(b"");
    let mut parts = strings::split(v, b".");
    let mut next = || {
        parts
            .next()
            .map(|p| {
                p.iter()
                    .take_while(|b| b.is_ascii_digit())
                    .fold(0u32, |n, b| n.saturating_mul(10).saturating_add(u32::from(b - b'0')))
            })
            .unwrap_or(0)
    };
    let major = next();
    let minor = next();
    (major, minor, next())
}

fn detect_emulator() -> Detected {
    let term = env_var::TERM.get().unwrap_or(b"");
    let term_program = env_var::TERM_PROGRAM.get().unwrap_or(b"");

    let multiplexed = env_var::TMUX.get().is_some()
        || var(crate::zstr!("STY")).is_some()
        || var(crate::zstr!("ZELLIJ")).is_some()
        || term.starts_with(b"screen")
        || term.starts_with(b"tmux")
        || eq_ignore_case(term_program, b"tmux");

    let none = Detected {
        emulator: Emulator::Unknown,
        capabilities: Capabilities::default(),
        multiplexed,
    };
    if term == b"dumb" {
        return none;
    }

    let emulator = if eq_ignore_case(term_program, b"ghostty") {
        Emulator::Ghostty
    } else if eq_ignore_case(term_program, b"wezterm") {
        Emulator::WezTerm
    } else if term_program == b"iTerm.app" {
        Emulator::ITerm2
    } else if term_program == b"vscode" {
        Emulator::VsCode
    } else if eq_ignore_case(term_program, b"rio") || term == b"rio" {
        Emulator::Rio
    } else if var(crate::zstr!("GHOSTTY_RESOURCES_DIR")).is_some()
        || strings::index_of(term, b"ghostty").is_some()
    {
        Emulator::Ghostty
    } else if var(crate::zstr!("KITTY_WINDOW_ID")).is_some()
        || strings::index_of(term, b"kitty").is_some()
    {
        Emulator::Kitty
    } else if var(crate::zstr!("WEZTERM_EXECUTABLE")).is_some() {
        Emulator::WezTerm
    } else if var(crate::zstr!("ALACRITTY_WINDOW_ID")).is_some() || term == b"alacritty" {
        Emulator::Alacritty
    } else if var(crate::zstr!("WT_SESSION")).is_some() {
        Emulator::WindowsTerminal
    } else if var(crate::zstr!("ConEmuANSI")).is_some_and(|v| v == b"ON") {
        Emulator::ConEmu
    } else if vte_version() > 0 {
        Emulator::Vte
    } else {
        return none;
    };

    // OSC 9;4 only where it is known to be a progress report: WezTerm's
    // releases, iTerm2 before 3.6.6, kitty before 0.38 (whose version is not
    // in the environment) and Rio before 0.3.11 show OSC 9 as a notification.
    let version = term_program_version();
    let capabilities = match emulator {
        Emulator::WindowsTerminal => Capabilities {
            images: Images {
                sixel: true,
                ..Images::default()
            },
            ..ALL
        },
        Emulator::ConEmu => Capabilities {
            progress: true,
            ..Capabilities::default()
        },
        Emulator::Vte => {
            let vte = vte_version();
            Capabilities {
                truecolor: vte >= 3600,
                hyperlinks: vte > 5000,
                progress: vte >= 8000,
                ..Capabilities::default()
            }
        }
        Emulator::Ghostty => Capabilities {
            progress: version >= (1, 2, 0),
            notifications: true,
            images: Images {
                kitty: true,
                ..Images::default()
            },
            ..ALL
        },
        Emulator::Kitty => Capabilities {
            progress: false,
            notifications: true,
            images: Images {
                kitty: true,
                ..Images::default()
            },
            ..ALL
        },
        Emulator::WezTerm => Capabilities {
            progress: false,
            notifications: true,
            images: Images {
                sixel: true,
                kitty: true,
                iterm2: true,
            },
            ..ALL
        },
        Emulator::Rio => Capabilities {
            progress: version >= (0, 3, 11),
            notifications: true,
            images: Images {
                sixel: true,
                kitty: true,
                iterm2: true,
            },
            ..ALL
        },
        Emulator::Alacritty => Capabilities {
            progress: false,
            ..ALL
        },
        Emulator::ITerm2 => Capabilities {
            hyperlinks: version >= (3, 1, 0),
            progress: version >= (3, 6, 6),
            notifications: true,
            images: Images {
                sixel: true,
                kitty: version >= (3, 7, 0),
                iterm2: true,
            },
            ..ALL
        },
        Emulator::VsCode => Capabilities {
            truecolor: true,
            hyperlinks: true,
            ..Capabilities::default()
        },
        Emulator::Unknown => Capabilities::default(),
    };

    Detected {
        emulator,
        capabilities,
        multiplexed,
    }
}

/// `FORCE_HYPERLINK` as `supports-hyperlinks` reads it: set and non-empty
/// forces hyperlinks on, unless it is a number equal to zero.
fn force_hyperlink() -> Option<bool> {
    let v = var(crate::zstr!("FORCE_HYPERLINK"))?;
    if v.is_empty() {
        return None;
    }
    let digits = v.iter().take_while(|b| b.is_ascii_digit()).count();
    Some(!(digits > 0 && v[..digits].iter().all(|&b| b == b'0')))
}

fn compute_capabilities() -> Capabilities {
    let mut caps = match env_var::BUN_TERMINAL_FEATURES.get() {
        Some(false) => return Capabilities::default(),
        Some(true) => ALL,
        None => {
            let detected = emulator();
            if detected.multiplexed
                || env_var::CI.get().is_some()
                || !output::is_stderr_tty()
                || !output::enable_ansi_colors_stderr()
            {
                Capabilities::default()
            } else {
                detected.capabilities
            }
        }
    };
    if let Some(forced) = force_hyperlink() {
        caps.hyperlinks = forced;
    }
    caps
}

// ── OSC 8 ─────────────────────────────────────────────────────────────────

pub const HYPERLINK_END: &str = "\x1b]8;;\x1b\\";

pub fn is_absolute_path(path: &[u8]) -> bool {
    if cfg!(windows) {
        (path.len() >= 3
            && path[0].is_ascii_alphabetic()
            && path[1] == b':'
            && (path[2] == b'\\' || path[2] == b'/'))
            || path.starts_with(b"\\\\")
    } else {
        path.first() == Some(&b'/')
    }
}

/// Writes the OSC 8 sequence that opens a link to the absolute `path` as a
/// `file://` URL; [`HYPERLINK_END`] closes it.
pub struct HyperlinkStart<'a>(pub &'a [u8]);

impl fmt::Display for HyperlinkStart<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("\x1b]8;;file://")?;
        let mut path = self.0;
        if cfg!(windows) {
            if let Some(unc) = path.strip_prefix(b"\\\\") {
                // `\\server\share\x` is `file://server/share/x`.
                path = unc;
            } else {
                f.write_str("/")?;
            }
        }
        const HEX: &[u8; 16] = b"0123456789ABCDEF";
        for &b in path {
            match b {
                b'\\' if cfg!(windows) => f.write_str("/")?,
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b'/' | b':' => {
                    f.write_char(char::from(b))?
                }
                _ => {
                    f.write_char('%')?;
                    f.write_char(char::from(HEX[usize::from(b >> 4)]))?;
                    f.write_char(char::from(HEX[usize::from(b & 0xF)]))?;
                }
            }
        }
        f.write_str("\x1b\\")
    }
}

// ── OSC 9;4 ───────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum ProgressState {
    Clear = 0,
    Normal = 1,
    Error = 2,
    Indeterminate = 3,
    Warning = 4,
}

const PROGRESS_CLEAR: &[u8] = b"\x1b]9;4;0;0\x1b\\";

/// Set once a progress sequence is on the terminal, so that exit and signals
/// clear it.
static PROGRESS_SHOWN: AtomicBool = AtomicBool::new(false);

/// Writes the OSC 9;4 sequence into `buf`; returns its length.
pub fn progress_sequence(buf: &mut [u8; 16], state: ProgressState, percent: u8) -> usize {
    let percent = if state == ProgressState::Clear || state == ProgressState::Indeterminate {
        0
    } else {
        percent.min(100)
    };
    let mut len = 0;
    for part in [b"\x1b]9;4;".as_slice(), &[b'0' + state as u8, b';']] {
        buf[len..len + part.len()].copy_from_slice(part);
        len += part.len();
    }
    if percent >= 100 {
        buf[len] = b'1';
        len += 1;
    }
    if percent >= 10 {
        buf[len] = b'0' + (percent / 10) % 10;
        len += 1;
    }
    buf[len] = b'0' + percent % 10;
    len += 1;
    buf[len..len + 2].copy_from_slice(b"\x1b\\");
    len + 2
}

/// The sequence the caller must write to show `state`, or nothing for
/// [`ProgressState::Clear`] when no progress is shown.
pub fn progress_update(buf: &mut [u8; 16], state: ProgressState, percent: u8) -> usize {
    if state == ProgressState::Clear {
        if !PROGRESS_SHOWN.swap(false, Ordering::Relaxed) {
            return 0;
        }
    } else {
        PROGRESS_SHOWN.store(true, Ordering::Relaxed);
    }
    progress_sequence(buf, state, percent)
}

/// Shows `state` at `percent` in the terminal's progress indicator.
pub fn set_progress(state: ProgressState, percent: u8) {
    if !progress() {
        return;
    }
    let mut buf = [0u8; 16];
    let len = progress_update(&mut buf, state, percent);
    if len > 0 {
        output::flush();
        let _ = output::File::stderr().write(&buf[..len]);
    }
}

/// Removes the progress indicator if Bun showed one.
pub fn clear_progress() {
    set_progress(ProgressState::Clear, 0);
}

/// [`clear_progress`] for a signal handler: one `write(2)`, no lock, no flush.
#[unsafe(no_mangle)]
pub extern "C" fn Bun__clearTerminalProgress() {
    if !PROGRESS_SHOWN.swap(false, Ordering::Relaxed) {
        return;
    }
    #[cfg(unix)]
    {
        // SAFETY: async-signal-safe write of a static buffer to fd 2.
        let _ = unsafe { libc::write(2, PROGRESS_CLEAR.as_ptr().cast(), PROGRESS_CLEAR.len()) };
    }
    #[cfg(not(unix))]
    {
        let _ = output::File::stderr().write(PROGRESS_CLEAR);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seq(state: ProgressState, percent: u8) -> Vec<u8> {
        let mut buf = [0u8; 16];
        let len = progress_sequence(&mut buf, state, percent);
        buf[..len].to_vec()
    }

    #[test]
    fn progress_sequences() {
        assert_eq!(seq(ProgressState::Normal, 0), b"\x1b]9;4;1;0\x1b\\");
        assert_eq!(seq(ProgressState::Normal, 42), b"\x1b]9;4;1;42\x1b\\");
        assert_eq!(seq(ProgressState::Error, 100), b"\x1b]9;4;2;100\x1b\\");
        assert_eq!(seq(ProgressState::Normal, 250), b"\x1b]9;4;1;100\x1b\\");
        assert_eq!(seq(ProgressState::Indeterminate, 50), b"\x1b]9;4;3;0\x1b\\");
        assert_eq!(seq(ProgressState::Clear, 7), PROGRESS_CLEAR);
    }

    #[test]
    fn file_url() {
        let path: &[u8] = if cfg!(windows) {
            b"C:\\a b\\%.ts"
        } else {
            b"/a b/%.ts"
        };
        let expected = if cfg!(windows) {
            "\x1b]8;;file:///C:/a%20b/%25.ts\x1b\\"
        } else {
            "\x1b]8;;file:///a%20b/%25.ts\x1b\\"
        };
        assert_eq!(HyperlinkStart(path).to_string(), expected);
    }
}
