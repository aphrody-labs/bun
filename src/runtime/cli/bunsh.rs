//! `bunsh`: Bun Shell as a system shell, selected by argv0 (`bunsh`, or `-bunsh` for a login shell).
//!
//! ```text
//! bunsh -c '<cmd>' [name [args...]]   $0 = name, $1.. = args
//! bunsh script.sh [args...]
//! bunsh                               interactive on a terminal, else reads the script from stdin
//! ```
//!
//! Unlike `Bun.$`, `exit` ends the whole script, and the interactive session keeps `cd`, variables,
//! `export`s and `$?` from one line to the next.

use bstr::BStr;

use bun_bundler::Transpiler;
use bun_core::{Global, Output};
use bun_options_types::schema::api;
use bun_sys::Fd;

use super::repl_command::repl::{History, Key, KeyReader, LineEditor};
use crate::command::ContextData;
use crate::shell::interpreter::ShellSession;
use crate::shell::{ExitCode, Interpreter};

const HISTORY_FILENAME: &[u8] = b".bunsh_history";

const USAGE: &str = "Usage: bunsh [-l] [-c command [name [args...]] | script [args...]]\n\
\n\
Bun Shell as a login and system shell.\n\
\n\
  -c command   run command; the next arguments become $0, $1, ...\n\
  -s           read the script from stdin\n\
  -l, --login  login shell (accepted; bunsh reads no profile files)\n\
  -i           interactive (the default on a terminal)\n\
  --version    print the Bun version\n";

/// argv0 names `bunsh`; a login shell gets it with a leading `-`.
pub(crate) fn is_bunsh(argv0: &[u8]) -> bool {
    let name = argv0
        .rsplit(|byte| *byte == b'/' || *byte == b'\\')
        .next()
        .unwrap_or(argv0);
    let name = name.strip_prefix(b"-").unwrap_or(name);
    matches!(name, b"bunsh" | b"bunsh.exe")
}

enum Mode {
    Command(Box<[u8]>),
    Script(Box<[u8]>),
    Stdin,
    Interactive,
}

fn usage_error(msg: &str) -> ! {
    bun_core::pretty_errorln!("bunsh: {}", msg);
    Output::flush();
    Global::exit(2);
}

pub(crate) fn exec(ctx: &'static mut ContextData) -> Result<(), crate::Error> {
    let argv = bun_core::argv();
    let args: Vec<Box<[u8]>> = (1..argv.len())
        .filter_map(|i| argv.get(i).map(|a| Box::<[u8]>::from(a.as_bytes())))
        .collect();

    let mut i = 0;
    let mut mode: Option<Mode> = None;
    let mut force_interactive = false;
    while i < args.len() {
        match &*args[i] {
            b"-c" => {
                let Some(cmd) = args.get(i + 1) else {
                    usage_error("-c: option requires an argument");
                };
                mode = Some(Mode::Command(cmd.clone()));
                i += 2;
                break;
            }
            b"-s" => {
                mode = Some(Mode::Stdin);
                i += 1;
                break;
            }
            b"-l" | b"--login" => i += 1,
            b"-i" => {
                force_interactive = true;
                i += 1;
            }
            b"-h" | b"--help" => {
                let _ = Output::writer().write_all(USAGE.as_bytes());
                Output::flush();
                Global::exit(0);
            }
            b"--version" => super::print_version_and_exit(),
            b"--" => {
                i += 1;
                break;
            }
            arg if arg.len() > 1 && arg[0] == b'-' => {
                usage_error(&format!("{}: invalid option", BStr::new(arg)));
            }
            _ => break,
        }
    }
    let rest = &args[i..];
    let argv0: Box<[u8]> = argv
        .get(0)
        .map(|a| Box::<[u8]>::from(a.as_bytes()))
        .unwrap_or_else(|| Box::from(&b"bunsh"[..]));

    let mode = match mode {
        Some(Mode::Command(cmd)) => {
            // `sh -c cmd name a b`: $0 = name, $1 = a, $2 = b.
            ctx.positionals = vec![rest.first().cloned().unwrap_or(argv0)];
            ctx.passthrough = rest.iter().skip(1).cloned().collect();
            Mode::Command(cmd)
        }
        Some(Mode::Stdin) => {
            ctx.positionals = vec![argv0];
            ctx.passthrough = rest.to_vec();
            Mode::Stdin
        }
        _ if !rest.is_empty() && !force_interactive => {
            ctx.positionals = vec![rest[0].clone()];
            ctx.passthrough = rest[1..].to_vec();
            Mode::Script(rest[0].clone())
        }
        _ => {
            ctx.positionals = vec![argv0];
            ctx.passthrough = Vec::new();
            if force_interactive || (Output::is_stdin_tty() && Output::is_stdout_tty()) {
                Mode::Interactive
            } else {
                Mode::Stdin
            }
        }
    };

    let mini = boot(ctx)?;
    let mut session = ShellSession::default();
    let code = match mode {
        Mode::Command(cmd) => run(ctx, mini, b"-c", &cmd, &mut session),
        Mode::Script(path) => {
            let src = match bun_sys::File::read_from(Fd::cwd(), &path) {
                Ok(src) => src,
                Err(err) => {
                    Output::err(err, "bunsh: cannot open <b>{}<r>", (BStr::new(&path),));
                    Output::flush();
                    Global::exit(127);
                }
            };
            run(ctx, mini, bun_paths::basename(&path), &src, &mut session)
        }
        Mode::Stdin => {
            let stdin = bun_sys::File::from_fd(Fd::stdin());
            let src = match stdin.read_to_end() {
                Ok(src) => src,
                Err(err) => {
                    Output::err(err, "bunsh: failed to read stdin", ());
                    Output::flush();
                    Global::exit(1);
                }
            };
            run(ctx, mini, b"stdin", &src, &mut session)
        }
        Mode::Interactive => interactive(ctx, mini, &mut session),
    };
    Output::flush();
    Global::exit(u32::from(code));
}

/// Loads the process environment (no `.env` files: this is a system shell) and the mini event loop.
fn boot(
    ctx: &mut ContextData,
) -> Result<&'static mut bun_event_loop::MiniEventLoop::MiniEventLoop, crate::Error> {
    let mut transpiler = Transpiler::init(
        super::exec_command::exec_arena(),
        ctx.log,
        {
            let mut args = ctx.args.clone();
            args.write = Some(false);
            args.target = Some(api::Target::Bun);
            args
        },
        None,
    )?;
    transpiler.run_env_loader(true)?;
    let mut buf = bun_paths::path_buffer_pool::get();
    let cwd: &[u8] = match bun_sys::getcwd(&mut *buf) {
        Ok(n) => &buf[..n],
        Err(err) => {
            Output::err(err, "bunsh: cannot read the current directory", ());
            Output::flush();
            Global::exit(1);
        }
    };
    // SAFETY: `Transpiler::init` always populates `env` with the process-lifetime loader.
    let env = unsafe { &mut *transpiler.env };
    let mini = bun_event_loop::MiniEventLoop::init_global(Some(env), Some(cwd));
    // SAFETY: the thread-local singleton; no other `&mut` to it lives on this thread.
    Ok(unsafe { &mut *mini })
}

fn run(
    ctx: &mut ContextData,
    mini: &mut bun_event_loop::MiniEventLoop::MiniEventLoop,
    label: &[u8],
    src: &[u8],
    session: &mut ShellSession,
) -> ExitCode {
    // SAFETY: `mini` is the thread-local singleton from `boot`, alive for the process.
    let mini: &'static mut _ = unsafe { &mut *std::ptr::from_mut(mini) };
    match Interpreter::init_and_run_session(ctx, mini, label, src, session) {
        Ok(code) => code,
        Err(err) => {
            Output::err(err, "bunsh: failed to run <b>{}<r>", (BStr::new(label),));
            Output::flush();
            1
        }
    }
}

/// The terminal in raw mode while a line is edited, back to normal while it runs.
struct Terminal {
    #[cfg(unix)]
    state: bun_core::tty::State,
    #[cfg(windows)]
    original_mode: Option<bun_sys::windows::DWORD>,
}

impl Terminal {
    fn new() -> Terminal {
        Terminal {
            #[cfg(unix)]
            state: bun_core::tty::State::new(),
            #[cfg(windows)]
            original_mode: None,
        }
    }

    fn raw(&mut self) {
        #[cfg(unix)]
        {
            let _ = self.state.set_mode(
                0,
                bun_core::tty::Mode::Raw,
                bun_core::tty::SetAttrWhen::Drain,
            );
        }
        #[cfg(windows)]
        {
            self.original_mode = bun_sys::windows::update_stdio_mode_flags(
                bun_sys::Stdio::StdIn,
                bun_sys::windows::UpdateStdioModeFlagsOpts {
                    set: bun_sys::windows::ENABLE_VIRTUAL_TERMINAL_INPUT,
                    unset: bun_sys::windows::ENABLE_LINE_INPUT
                        | bun_sys::windows::ENABLE_ECHO_INPUT
                        | bun_sys::windows::ENABLE_PROCESSED_INPUT,
                },
            )
            .ok();
        }
    }

    fn normal(&mut self) {
        #[cfg(unix)]
        {
            let _ = self.state.set_mode(
                0,
                bun_core::tty::Mode::Normal,
                bun_core::tty::SetAttrWhen::Drain,
            );
        }
        #[cfg(windows)]
        {
            if let Some(mode) = self.original_mode.take() {
                // SAFETY: stdin is a console handle (checked by the caller via `is_stdin_tty`).
                unsafe {
                    let _ = bun_sys::windows::SetConsoleMode(Fd::stdin().native(), mode);
                }
            }
        }
    }
}

fn prompt(session: &ShellSession) -> Vec<u8> {
    let mut out = Vec::new();
    let cwd = session.cwd.as_deref().unwrap_or(b"");
    let home = bun_core::env_var::HOME.get().unwrap_or(b"");
    if !home.is_empty() && cwd.starts_with(home) && (cwd.len() == home.len() || cwd[home.len()] == b'/') {
        out.push(b'~');
        out.extend_from_slice(&cwd[home.len()..]);
    } else {
        out.extend_from_slice(cwd);
    }
    #[cfg(unix)]
    // SAFETY: `geteuid` has no preconditions.
    let root = unsafe { libc::geteuid() } == 0;
    #[cfg(not(unix))]
    let root = false;
    out.extend_from_slice(if root { b" # " } else { b" $ " });
    out
}

fn redraw(prompt: &[u8], editor: &LineEditor) {
    let w = Output::writer();
    let _ = w.write_all(b"\r\x1b[K");
    let _ = w.write_all(prompt);
    let _ = w.write_all(&editor.buffer);
    let back = editor.buffer.len() - editor.cursor;
    if back > 0 {
        let _ = w.write_fmt(format_args!("\x1b[{back}D"));
    }
    Output::flush();
}

enum Line {
    Run(Vec<u8>),
    Eof,
}

fn read_line(
    keys: &mut KeyReader,
    editor: &mut LineEditor,
    history: &mut History,
    prompt: &[u8],
) -> Line {
    editor.clear();
    history.reset_position();
    redraw(prompt, editor);
    loop {
        let Some(key) = keys.read_key() else {
            return Line::Eof;
        };
        match key {
            Key::Enter => {
                let _ = Output::writer().write_all(b"\r\n");
                Output::flush();
                return Line::Run(core::mem::take(&mut editor.buffer));
            }
            Key::CtrlD => {
                if editor.buffer.is_empty() {
                    let _ = Output::writer().write_all(b"\r\n");
                    Output::flush();
                    return Line::Eof;
                }
                editor.delete_char();
            }
            Key::CtrlC => {
                let _ = Output::writer().write_all(b"^C\r\n");
                editor.clear();
                history.reset_position();
            }
            Key::CtrlL => {
                let _ = Output::writer().write_all(b"\x1b[H\x1b[2J");
            }
            Key::Backspace => editor.backspace(),
            Key::Delete => editor.delete_char(),
            Key::CtrlA | Key::Home => editor.move_to_start(),
            Key::CtrlE | Key::End => editor.move_to_end(),
            Key::CtrlB | Key::ArrowLeft => editor.move_left(),
            Key::CtrlF | Key::ArrowRight => editor.move_right(),
            Key::AltB | Key::AltLeft => editor.move_word_left(),
            Key::AltF | Key::AltRight => editor.move_word_right(),
            Key::CtrlK => editor.delete_to_end(),
            Key::CtrlU => editor.delete_to_start(),
            Key::CtrlW | Key::AltBackspace => editor.backspace_word(),
            Key::AltD => editor.delete_word(),
            Key::CtrlT => editor.swap(),
            Key::CtrlP | Key::ArrowUp => {
                let current = editor.buffer.clone();
                if let Some(prev) = history.prev(&current) {
                    let prev = prev.to_vec();
                    let _ = editor.set(&prev);
                }
            }
            Key::CtrlN | Key::ArrowDown => {
                if let Some(next) = history.next() {
                    let next = next.to_vec();
                    let _ = editor.set(&next);
                }
            }
            Key::Tab => {
                let _ = editor.insert_slice(b"  ");
            }
            Key::Char(c) => {
                let _ = editor.insert(c);
            }
            Key::Text(bytes, len) => {
                let _ = editor.insert_slice(&bytes[..len]);
            }
            _ => {}
        }
        redraw(prompt, editor);
    }
}

fn interactive(
    ctx: &mut ContextData,
    mini: &mut bun_event_loop::MiniEventLoop::MiniEventLoop,
    session: &mut ShellSession,
) -> ExitCode {
    bun_spawn::ctrl_c::set_interactive(true);
    bun_spawn::ctrl_c::install();

    let mut history = History::init();
    let _ = history.load_file(HISTORY_FILENAME);
    let mut keys = KeyReader::new();
    let mut editor = LineEditor::init();
    let mut terminal = Terminal::new();
    let mut last: ExitCode = 0;

    // Seeds `session.cwd`, so the first prompt shows it.
    run(ctx, mini, b"bunsh", b"true", session);

    loop {
        let prompt = prompt(session);
        terminal.raw();
        let line = read_line(&mut keys, &mut editor, &mut history, &prompt);
        terminal.normal();
        let line = match line {
            Line::Eof => break,
            Line::Run(line) => line,
        };
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let _ = history.add(&line);
        last = run(ctx, mini, b"bunsh", &line, session);
        Output::flush();
        if session.exited {
            break;
        }
    }
    history.save();
    last
}
