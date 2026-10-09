//! `run` / `test`: `bun run` and `bun test` through this binary, with a timeout and an output
//! digest (head, failure lines, tail) instead of the raw stream.

use std::fmt::Write as _;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::registry::{Annotations, Args, Context, Output, Tool, ToolError};

const MAX_CAPTURE: usize = 32 * 1024 * 1024;

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
    let mut cmd = Command::new(&exe);
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
    let mut child = cmd.spawn()?;
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
    let stdout = stdout.and_then(|h| h.join().ok()).unwrap_or_default();
    let stderr = stderr.and_then(|h| h.join().ok()).unwrap_or_default();
    let code = status.and_then(|s| s.code());
    let mut out = format!("$ bun {}\n", argv.join(" "));
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

pub(crate) const TOOLS: &[Tool] = &[
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
