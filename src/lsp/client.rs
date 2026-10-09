//! Questions to the daemon of a workspace, which is started if it is not running.

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::daemon::{self, Stream};
use crate::language;
use crate::service::{Answer, Query};
use crate::Options;

/// How long a new daemon may take to listen.
const START_TIMEOUT: Duration = Duration::from_secs(15);

/// Answers `query` through the daemon of the workspace of `query.file`.
pub fn query(query: &Query, options: &Options) -> Result<Answer, String> {
    let query = query.clone().absolute();
    let root = language::workspace_root(&query.file);
    let response = send(&root, &json!({ "op": "query", "query": query }), options, true)?;
    serde_json::from_value(response["answer"].clone()).map_err(|err| format!("invalid answer from the bun lsp daemon: {err}"))
}

/// Sends `request` to the daemon of `root` and returns its answer. With `start`, starts the
/// daemon if none is running; otherwise fails.
pub fn send(root: &Path, request: &Value, options: &Options, start: bool) -> Result<Value, String> {
    let name = daemon::endpoint_name(root, options.bun.as_deref());
    let stream = match daemon::connect(&name) {
        Ok(stream) => stream,
        Err(_) if start => start_daemon(root, &name, options)?,
        Err(err) => return Err(format!("no bun lsp daemon for {:?}: {err}", root.display().to_string())),
    };
    exchange(stream, request)
}

fn exchange(stream: Stream, request: &Value) -> Result<Value, String> {
    let mut writer = stream.try_clone().map_err(|err| err.to_string())?;
    let mut line = serde_json::to_string(request).map_err(|err| err.to_string())?;
    line.push('\n');
    writer.write_all(line.as_bytes()).and_then(|()| writer.flush()).map_err(|err| format!("could not write to the bun lsp daemon: {err}"))?;
    let mut reader = BufReader::new(stream);
    let mut response = String::new();
    reader.read_line(&mut response).map_err(|err| format!("could not read from the bun lsp daemon: {err}"))?;
    if response.is_empty() {
        return Err("the bun lsp daemon closed the connection".to_owned());
    }
    let response: Value = serde_json::from_str(&response).map_err(|err| format!("invalid answer from the bun lsp daemon: {err}"))?;
    if response.get("ok") == Some(&Value::Bool(true)) {
        return Ok(response);
    }
    Err(response.get("error").and_then(Value::as_str).unwrap_or("the bun lsp daemon failed").to_owned())
}

fn start_daemon(root: &Path, name: &str, options: &Options) -> Result<Stream, String> {
    let Some(bun) = options.bun.as_deref() else {
        return Err("cannot start the bun lsp daemon: the Bun executable is unknown".to_owned());
    };
    spawn_detached(bun, root).map_err(|err| format!("could not start the bun lsp daemon ({}): {err}", bun.display()))?;
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        match daemon::connect(name) {
            Ok(stream) => return Ok(stream),
            Err(err) if Instant::now() >= deadline => {
                return Err(format!("the bun lsp daemon did not listen within {} s: {err}", START_TIMEOUT.as_secs()));
            }
            Err(_) => std::thread::sleep(Duration::from_millis(10)),
        }
    }
}

#[cfg(unix)]
fn spawn_detached(bun: &Path, root: &Path) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};
    let mut child = Command::new(bun)
        .args(["lsp", "daemon", "--root"])
        .arg(root)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()?;
    // Reaped here if this process outlives it.
    let _ = std::thread::Builder::new().name("lsp-daemon-wait".into()).spawn(move || child.wait());
    Ok(())
}

/// `CreateProcessW` without inheriting handles: the daemon must not hold the pipes of whoever
/// ran this process, or they would never see the end of its output.
#[cfg(windows)]
fn spawn_detached(bun: &Path, root: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    use bun_windows_sys as win;

    fn quote(arg: &std::ffi::OsStr, line: &mut Vec<u16>) {
        let arg: Vec<u16> = arg.encode_wide().collect();
        line.push(u16::from(b'"'));
        let mut backslashes = 0usize;
        for &unit in &arg {
            if unit == u16::from(b'\\') {
                backslashes += 1;
                continue;
            }
            let escaped = if unit == u16::from(b'"') { backslashes * 2 + 1 } else { backslashes };
            line.extend(std::iter::repeat_n(u16::from(b'\\'), escaped));
            backslashes = 0;
            line.push(unit);
        }
        line.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes * 2));
        line.push(u16::from(b'"'));
    }

    let mut line = Vec::new();
    for (index, arg) in [bun.as_os_str(), "lsp".as_ref(), "daemon".as_ref(), "--root".as_ref(), root.as_os_str()].into_iter().enumerate() {
        if index > 0 {
            line.push(u16::from(b' '));
        }
        quote(arg, &mut line);
    }
    line.push(0);
    let application: Vec<u16> = bun.as_os_str().encode_wide().chain(Some(0)).collect();
    let directory: Vec<u16> = root.as_os_str().encode_wide().chain(Some(0)).collect();
    let flags = win::CREATE_NO_WINDOW | win::CREATE_NEW_PROCESS_GROUP;
    // Out of the job of the caller if it allows that: a job that kills its processes on close would
    // take the daemon with the first client.
    for flags in [flags | win::CREATE_BREAKAWAY_FROM_JOB, flags] {
        let mut startup = win::STARTUPINFOW {
            cb: core::mem::size_of::<win::STARTUPINFOW>() as u32,
            lpReserved: core::ptr::null_mut(),
            lpDesktop: core::ptr::null_mut(),
            lpTitle: core::ptr::null_mut(),
            dwX: 0,
            dwY: 0,
            dwXSize: 0,
            dwYSize: 0,
            dwXCountChars: 0,
            dwYCountChars: 0,
            dwFillAttribute: 0,
            dwFlags: 0,
            wShowWindow: 0,
            cbReserved2: 0,
            lpReserved2: core::ptr::null_mut(),
            hStdInput: core::ptr::null_mut(),
            hStdOutput: core::ptr::null_mut(),
            hStdError: core::ptr::null_mut(),
        };
        let mut information = win::PROCESS_INFORMATION {
            hProcess: core::ptr::null_mut(),
            hThread: core::ptr::null_mut(),
            dwProcessId: 0,
            dwThreadId: 0,
        };
        // SAFETY: every string is NUL-terminated and `line` is writable, as `CreateProcessW` needs;
        // `startup` and `information` are initialized and outlive the call.
        let created = unsafe {
            win::kernel32::CreateProcessW(
                application.as_ptr(),
                line.as_mut_ptr(),
                core::ptr::null_mut(),
                core::ptr::null_mut(),
                0,
                flags,
                core::ptr::null_mut(),
                directory.as_ptr(),
                &raw mut startup,
                &raw mut information,
            )
        };
        if created != 0 {
            // SAFETY: both handles were returned by `CreateProcessW` and are closed once.
            unsafe {
                win::CloseHandle(information.hThread);
                win::CloseHandle(information.hProcess);
            }
            return Ok(());
        }
        if flags & win::CREATE_BREAKAWAY_FROM_JOB == 0 {
            break;
        }
    }
    Err(std::io::Error::last_os_error())
}
