//! `run` / `test`: `bun run` and `bun test` through this binary, with a timeout and an output
//! digest (head, failure lines, tail) instead of the raw stream.

use std::fmt::Write as _;
use std::io::Read;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

const MAX_CAPTURE: usize = 32 * 1024 * 1024;

#[cfg(windows)]
struct ChildJob(*mut core::ffi::c_void);

#[cfg(windows)]
impl ChildJob {
    fn new() -> Result<Self, ToolError> {
        use bun_sys::windows as win;
        // SAFETY: Null attributes and name create an unnamed job owned by this call.
        let handle = unsafe { win::CreateJobObjectA(core::ptr::null_mut(), core::ptr::null()) };
        if handle.is_null() {
            return Err(std::io::Error::last_os_error().into());
        }
        let job = Self(handle);
        let mut limits: win::JOBOBJECT_EXTENDED_LIMIT_INFORMATION = bun_core::ffi::zeroed();
        limits.BasicLimitInformation.LimitFlags = win::JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // SAFETY: The job and POD buffer remain live for this call.
        if unsafe {
            win::SetInformationJobObject(
                handle,
                win::JobObjectExtendedLimitInformation,
                core::ptr::from_mut(&mut limits).cast(),
                core::mem::size_of_val(&limits) as u32,
            )
        } == 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(job)
    }

    fn assign(&self, child: &std::process::Child) -> Result<(), ToolError> {
        use std::os::windows::io::AsRawHandle;
        // SAFETY: Both handles belong to live owners for the duration of assignment.
        if unsafe { bun_sys::windows::AssignProcessToJobObject(self.0, child.as_raw_handle()) } == 0
        {
            return Err(std::io::Error::last_os_error().into());
        }
        Ok(())
    }
}

#[cfg(windows)]
impl Drop for ChildJob {
    fn drop(&mut self) {
        // SAFETY: Closing our final job handle terminates its remaining descendants.
        unsafe {
            bun_sys::windows::CloseHandle(self.0);
        }
    }
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for c in chars.by_ref() {
                    if c.is_ascii_alphabetic() || c == '~' {
                        break;
                    }
                }
            }
            continue;
        }
        if c != '\r' {
            out.push(c);
        }
    }
    out
}

fn interesting(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    [
        "error",
        "fail",
        "panic",
        "✗",
        "(fail)",
        "expected",
        "received",
        "assert",
        "exception",
        "warning",
        "not found",
        "cannot",
    ]
    .iter()
    .any(|k| l.contains(k))
        || (l.trim_start().starts_with("at ") && l.contains(':'))
}

/// Head, failure-looking lines and tail of `text`, at most about `max_lines` lines.
fn digest(text: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() <= max_lines {
        return text.trim_end().to_owned();
    }
    let head = max_lines / 4;
    let tail = max_lines * 2 / 5;
    let middle_budget = max_lines - head - tail;
    let mut out: Vec<String> = lines[..head].iter().map(|l| (*l).to_owned()).collect();
    let middle = &lines[head..lines.len() - tail];
    let picked: Vec<(usize, &str)> = middle
        .iter()
        .enumerate()
        .filter(|(_, l)| interesting(l))
        .take(middle_budget)
        .map(|(i, l)| (i + head, *l))
        .collect();
    let mut last = head;
    for (i, l) in picked {
        if i > last {
            out.push(format!("… {} lines omitted …", i - last));
        }
        out.push(l.to_owned());
        last = i + 1;
    }
    let tail_start = lines.len() - tail;
    if tail_start > last {
        out.push(format!("… {} lines omitted …", tail_start - last));
    }
    out.extend(lines[tail_start..].iter().map(|l| (*l).to_owned()));
    out.join("\n")
}

fn read_capped(mut r: impl Read) -> Vec<u8> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 64 * 1024];
    loop {
        match r.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if buf.len() < MAX_CAPTURE {
                    buf.extend_from_slice(&chunk[..n]);
                }
            }
        }
    }
    buf
}

fn exec(ctx: &Context, args: &Args<'_>, argv: &[String]) -> Result<Output, ToolError> {
    let cwd = match args.opt_str("cwd") {
        Some(c) => ctx.cwd.join(c),
        None => ctx.cwd.clone(),
    };
    if !cwd.is_dir() {
        return Err(ToolError::InvalidArgs(format!(
            "cwd {} is not a directory",
            cwd.display()
        )));
    }
    let timeout = Duration::from_millis(args.uint("timeout_ms", 120_000, 600_000).max(1000));
    let exe: PathBuf = std::env::current_exe()?;
    let mut cmd = bun_no_window::command(&exe);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd.args(argv)
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("NO_COLOR", "1")
        .env("FORCE_COLOR", "0")
        .env_remove("BUN_MCP_PROFILE");
    if let Some(serde_json::Value::Object(env)) = args.get("env") {
        for (k, v) in env {
            if let Some(v) = v.as_str() {
                cmd.env(k, v);
            }
        }
    }
    let started = Instant::now();
    #[cfg(windows)]
    let job = ChildJob::new()?;
    let mut child = cmd.spawn()?;
    #[cfg(windows)]
    if let Err(error) = job.assign(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let stdout = child
        .stdout
        .take()
        .map(|s| std::thread::spawn(move || read_capped(s)));
    let stderr = child
        .stderr
        .take()
        .map(|s| std::thread::spawn(move || read_capped(s)));
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break Some(status);
        }
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break child.wait().ok();
        }
        std::thread::sleep(Duration::from_millis(15));
    };
    let elapsed = started.elapsed();
    #[cfg(unix)]
    if let Ok(pid) = i32::try_from(child.id()) {
        let _ = bun_sys::kill_process_group(pid);
    }
    #[cfg(windows)]
    drop(job);
    let stdout = stdout.and_then(|h| h.join().ok()).unwrap_or_default();
    let stderr = stderr.and_then(|h| h.join().ok()).unwrap_or_default();
    let code = status.and_then(|s| s.code());
    let mut out = if argv.first().is_some_and(|arg| arg == "-e") {
        String::from("$ bun:shell\n")
    } else {
        format!("$ bun {}\n", argv.join(" "))
    };
    let _ = write!(
        out,
        "exit: {} in {:.2}s",
        code.map_or_else(|| "signal".to_owned(), |c| c.to_string()),
        elapsed.as_secs_f64()
    );
    if timed_out {
        let _ = write!(
            out,
            " (killed after the {} ms timeout)",
            timeout.as_millis()
        );
    }
    out.push('\n');
    let lines = args.uint("max_lines", 200, 5000) as usize;
    for (name, bytes) in [("stdout", &stdout), ("stderr", &stderr)] {
        let text = strip_ansi(&String::from_utf8_lossy(bytes));
        if text.trim().is_empty() {
            continue;
        }
        let _ = write!(
            out,
            "\n--- {name} ({} lines) ---\n{}\n",
            text.lines().count(),
            digest(&text, lines)
        );
    }
    let ok = code == Some(0) && !timed_out;
    Ok(Output {
        text: out,
        is_error: !ok,
    })
}

fn run(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let mut argv = vec!["run".to_owned(), args.str("target")?.to_owned()];
    argv.extend(args.strings("args"));
    exec(ctx, args, &argv)
}

fn test(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let mut argv = vec!["test".to_owned()];
    argv.extend(args.strings("files"));
    if let Some(filter) = args.opt_str("filter") {
        argv.push("-t".into());
        argv.push(filter.to_owned());
    }
    argv.extend(args.strings("args"));
    exec(ctx, args, &argv)
}

fn shell(ctx: &Context, args: &Args<'_>) -> Result<Output, ToolError> {
    let command = args.str("command")?;
    if command.len() > 64 * 1024 {
        return Err(ToolError::InvalidArgs(
            "shell command exceeds 64 KiB".into(),
        ));
    }
    let argv = vec![
        "-e".to_owned(),
        "import { $ } from 'bun'; const result = await $`${{ raw: process.argv.at(-1) }}`.nothrow(); process.exitCode = result.exitCode;".to_owned(),
        "--".to_owned(),
        command.to_owned(),
    ];
    exec(ctx, args, &argv)
}

pub(crate) const TOOLS: &[Tool] = &[
    Tool {
        name: "shell",
        title: "Native Bun Shell",
        description: "Execute command text with the current Bun binary's embedded bun:shell. Supports cwd and environment, bounded stdout/stderr and exit status. Does not launch PowerShell, WSH, Bash or Node as the command interpreter.",
        input_schema: r#"{"type":"object","properties":{"command":{"type":"string","maxLength":65536},"cwd":{"type":"string"},"env":{"type":"object","additionalProperties":{"type":"string"}},"timeout_ms":{"type":"integer","minimum":1000,"maximum":600000,"default":120000},"max_lines":{"type":"integer","minimum":20,"maximum":5000,"default":200}},"required":["command"]}"#,
        annotations: Annotations::DESTRUCTIVE,
        call: shell,
    },
    Tool {
        name: "run",
        title: "bun run",
        description: "Run a package.json script or a file with `bun run`, with a timeout. Returns the exit code and a digest of stdout/stderr (head, error lines, tail).",
        input_schema: r#"{"type":"object","properties":{"target":{"type":"string","description":"Script name or file path"},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string","description":"Relative to the working directory"},"env":{"type":"object","additionalProperties":{"type":"string"}},"timeout_ms":{"type":"integer","minimum":1000,"maximum":600000,"default":120000},"max_lines":{"type":"integer","minimum":20,"maximum":5000,"default":200}},"required":["target"]}"#,
        annotations: Annotations::DESTRUCTIVE,
        call: run,
    },
    Tool {
        name: "test",
        title: "bun test",
        description: "Run `bun test` (optionally on some files and with a -t name filter), with a timeout. Returns the exit code and a digest of the output that keeps failures.",
        input_schema: r#"{"type":"object","properties":{"files":{"type":"array","items":{"type":"string"},"description":"Test files or path filters"},"filter":{"type":"string","description":"Test name pattern (-t)"},"args":{"type":"array","items":{"type":"string"}},"cwd":{"type":"string"},"env":{"type":"object","additionalProperties":{"type":"string"}},"timeout_ms":{"type":"integer","minimum":1000,"maximum":600000,"default":120000},"max_lines":{"type":"integer","minimum":20,"maximum":5000,"default":200}}}"#,
        annotations: Annotations::DESTRUCTIVE,
        call: test,
    },
];
