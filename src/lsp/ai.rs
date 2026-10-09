//! Fixes by a model. `BUN_LSP_AI` names a command that reads a prompt on stdin and prints its
//! answer (`claude -p`, `codex exec -`, `gemini`, `llm`, …). The prompt holds the lines around the
//! problem, its diagnostics, the hover of the language server, what the code graph knows of the
//! symbol and the docs of the workspace that name it; the first fenced block of the answer replaces
//! those lines.

use std::fmt::Write as _;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Lines of context on each side of the problem.
pub const CONTEXT_LINES: u32 = 8;
const MAX_DOCS: usize = 2;
const MAX_DOC_FILES: usize = 4000;
const DOC_LINES: usize = 12;
const MAX_ANSWER: usize = 1024 * 1024;

/// What a model gets to fix lines `start..=end` (0-based) of `path`.
pub struct Problem<'a> {
    pub root: &'a Path,
    pub path: &'a Path,
    pub language: &'a str,
    pub text: &'a str,
    pub start: u32,
    pub end: u32,
    /// `line:column severity code: message`, 1-based.
    pub diagnostics: Vec<String>,
    pub hover: Option<String>,
    pub graph: Option<String>,
    /// Path and excerpt.
    pub docs: Vec<(String, String)>,
}

/// Lines `line - CONTEXT_LINES ..= end + CONTEXT_LINES` of a text of `lines` lines.
pub fn window(lines: u32, start: u32, end: u32) -> (u32, u32) {
    let last = lines.saturating_sub(1);
    (start.saturating_sub(CONTEXT_LINES), end.saturating_add(CONTEXT_LINES).min(last))
}

fn lines(text: &str) -> Vec<&str> {
    let mut lines: Vec<&str> = text.split('\n').map(|line| line.strip_suffix('\r').unwrap_or(line)).collect();
    if text.ends_with('\n') {
        lines.pop();
    }
    lines
}

pub fn line_count(text: &str) -> u32 {
    lines(text).len() as u32
}

pub fn prompt(problem: &Problem) -> String {
    let path = problem.path.strip_prefix(problem.root).unwrap_or(problem.path).display().to_string().replace('\\', "/");
    let lines = lines(problem.text);
    let mut out = String::new();
    let _ = writeln!(
        out,
        "Fix the problem in lines {}-{} of `{path}` ({}). Answer with those lines, corrected, in one fenced code block, and nothing else in a code block. Keep the indentation and the lines that need no change.\n",
        problem.start + 1,
        problem.end + 1,
        problem.language,
    );
    if !problem.diagnostics.is_empty() {
        out.push_str("## Diagnostics\n\n");
        for diagnostic in &problem.diagnostics {
            let _ = writeln!(out, "- {diagnostic}");
        }
        out.push('\n');
    }
    let _ = writeln!(out, "## Lines {}-{}\n\n```{}", problem.start + 1, problem.end + 1, problem.language);
    for line in lines.iter().take(problem.end as usize + 1).skip(problem.start as usize) {
        out.push_str(line);
        out.push('\n');
    }
    out.push_str("```\n");
    if let Some(hover) = problem.hover.as_deref().filter(|it| !it.is_empty()) {
        let _ = write!(out, "\n## Language server\n\n{hover}\n");
    }
    if let Some(graph) = &problem.graph {
        let _ = write!(out, "\n## Code graph\n\n{graph}\n");
    }
    for (path, excerpt) in &problem.docs {
        let _ = write!(out, "\n## Docs: {path}\n\n{excerpt}\n");
    }
    out
}

/// The first fenced block of `answer`.
pub fn replacement(answer: &str) -> Option<String> {
    let open = answer.find("```")?;
    let body = &answer[open + 3..];
    let body = &body[body.find('\n')? + 1..];
    let close = body.find("```")?;
    Some(body[..close].to_owned())
}

/// `text` with lines `start..=end` (0-based) replaced by `replacement`.
pub fn splice(text: &str, start: u32, end: u32, replacement: &str) -> String {
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let lines = lines(text);
    let mut out: Vec<&str> = lines[..(start as usize).min(lines.len())].to_vec();
    let replaced: Vec<&str> = replacement.strip_suffix('\n').unwrap_or(replacement).split('\n').map(|it| it.strip_suffix('\r').unwrap_or(it)).collect();
    out.extend(replaced);
    out.extend(lines.iter().skip(end as usize + 1));
    let mut joined = out.join(newline);
    if text.ends_with('\n') {
        joined.push_str(newline);
    }
    joined
}

/// Up to two Markdown files under `root` (`README.md`, `docs/`) that name `word`, with the lines
/// around its first mention.
pub fn docs(root: &Path, word: &str) -> Vec<(String, String)> {
    if word.len() < 3 {
        return Vec::new();
    }
    let mut files: Vec<PathBuf> = vec![root.join("README.md")];
    let mut queue = vec![root.join("docs")];
    while let Some(dir) = queue.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            if files.len() >= MAX_DOC_FILES {
                break;
            }
            let path = entry.path();
            if entry.file_type().is_ok_and(|it| it.is_dir()) {
                queue.push(path);
            } else if path.extension().is_some_and(|it| it == "md" || it == "mdx") {
                files.push(path);
            }
        }
    }
    let mut out = Vec::new();
    for path in files {
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let lines = lines(&text);
        let Some(at) = lines.iter().position(|line| crate::links::word_at_any(line, word)) else { continue };
        let from = at.saturating_sub(DOC_LINES / 3);
        let excerpt = lines[from..(from + DOC_LINES).min(lines.len())].join("\n");
        let shown = path.strip_prefix(root).unwrap_or(&path).display().to_string().replace('\\', "/");
        out.push((shown, excerpt));
        if out.len() >= MAX_DOCS {
            break;
        }
    }
    out
}

/// Runs `command` with `prompt` on stdin; its stdout.
pub fn run(command: &[String], prompt: &str, timeout: Duration) -> Result<String, String> {
    let (program, args) = command.split_first().ok_or("BUN_LSP_AI is empty")?;
    let program = crate::language::which(program, &[]).unwrap_or_else(|| PathBuf::from(program));
    let mut child = Command::new(&program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("could not start {}: {err}", program.display()))?;
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let input = prompt.to_owned();
    let writer = std::thread::spawn(move || {
        let _ = stdin.write_all(input.as_bytes());
    });
    let mut stdout = child.stdout.take().ok_or("no stdout")?;
    let reader = std::thread::spawn(move || {
        let mut out = Vec::new();
        let _ = (&mut stdout).take(MAX_ANSWER as u64).read_to_end(&mut out);
        out
    });
    let mut stderr = child.stderr.take().ok_or("no stderr")?;
    let errors = std::thread::spawn(move || {
        let mut out = Vec::new();
        let _ = (&mut stderr).take(64 * 1024).read_to_end(&mut out);
        out
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{} did not answer in {} ms", program.display(), timeout.as_millis()));
            }
            Err(err) => return Err(err.to_string()),
        }
    };
    let _ = writer.join();
    let out = String::from_utf8_lossy(&reader.join().unwrap_or_default()).into_owned();
    if !status.success() {
        let errors = String::from_utf8_lossy(&errors.join().unwrap_or_default()).trim().to_owned();
        return Err(format!("{} failed ({status}): {errors}", program.display()));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splices_and_reads_answers() {
        assert_eq!(splice("a\nb\nc\n", 1, 1, "x\ny\n"), "a\nx\ny\nc\n");
        assert_eq!(splice("a\r\nb\r\n", 0, 0, "z"), "z\r\nb\r\n");
        assert_eq!(replacement("Here:\n```ts\nlet a = 1;\n```\nDone"), Some("let a = 1;\n".to_owned()));
        assert_eq!(replacement("no block"), None);
        assert_eq!(window(100, 50, 50), (42, 58));
        assert_eq!(window(5, 0, 4), (0, 4));
    }

    #[test]
    fn prompt_names_the_lines() {
        let problem = Problem {
            root: Path::new("/r"),
            path: Path::new("/r/a.ts"),
            language: "typescript",
            text: "const a: string = 1;\n",
            start: 0,
            end: 0,
            diagnostics: vec!["1:7 error 2322: Type 'number' is not assignable to type 'string'.".to_owned()],
            hover: None,
            graph: Some("**bun graph**".to_owned()),
            docs: Vec::new(),
        };
        let prompt = prompt(&problem);
        assert!(prompt.contains("lines 1-1 of `a.ts`"), "{prompt}");
        assert!(prompt.contains("```typescript\nconst a: string = 1;\n```"), "{prompt}");
        assert!(prompt.contains("## Code graph"), "{prompt}");
    }
}
