//! Formatting and linting delegate to the `oxfmt` and `oxlint` binaries (overridable through
//! `APHRODY_OXFMT` / `APHRODY_OXLINT`), because Oxc does not publish its formatter and linter crates.

use std::{
    io::Write,
    path::Path,
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
};

use oxc_span::SourceType;

use crate::Error;

/// Oxc tool binary: the `env` override, else `name` resolved on PATH.
pub(crate) fn tool(env: &str, name: &str) -> String {
    std::env::var(env).unwrap_or_else(|_| name.to_owned())
}

/// Bare file name of `filename`, after checking its extension selects JS/TS syntax.
fn file_name(filename: &str) -> Result<&str, Error> {
    let path = Path::new(filename);
    SourceType::from_path(path).map_err(|error| Error::input(error.to_string()))?;
    path.file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| Error::input(format!("{filename} has no file name")))
}

fn failure(program: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let text =
        if stderr.trim().is_empty() { String::from_utf8_lossy(&output.stdout) } else { stderr };
    let text = text.trim();
    if text.is_empty() {
        format!("{program} exited with {}", output.status)
    } else {
        text.to_owned()
    }
}

/// Formats with Oxc's default options: oxfmt runs from the temporary directory, away from project configs.
pub fn format(source: &str, filename: &str) -> Result<String, Error> {
    let name = file_name(filename)?;
    let program = tool("APHRODY_OXFMT", "oxfmt");
    let mut child = Command::new(&program)
        .arg(format!("--stdin-filepath={name}"))
        .current_dir(std::env::temp_dir())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| Error::tool(format!("{program}: {error}")))?;
    let mut stdin = child.stdin.take().ok_or_else(|| Error::tool("oxfmt stdin is unavailable"))?;
    let output = std::thread::scope(|scope| {
        let writer = scope.spawn(move || stdin.write_all(source.as_bytes()));
        let output = child.wait_with_output();
        writer
            .join()
            .map_err(|_| Error::tool("oxfmt stdin writer panicked"))?
            .map_err(|error| Error::tool(error.to_string()))?;
        output.map_err(|error| Error::tool(error.to_string()))
    })?;
    if !output.status.success() {
        return Err(Error::tool(failure(&program, &output)));
    }
    String::from_utf8(output.stdout).map_err(|error| Error::tool(error.to_string()))
}

static SCRATCH: AtomicU64 = AtomicU64::new(0);

/// Lints with Oxc's default rule set: oxlint has no stdin mode, so the source goes through a private
/// scratch directory that holds no project configuration.
pub fn lint(source: &str, filename: &str) -> Result<Vec<String>, Error> {
    let name = file_name(filename)?;
    let program = tool("APHRODY_OXLINT", "oxlint");
    let dir = std::env::temp_dir().join(format!(
        "aphrody-oxlint-{}-{}",
        std::process::id(),
        SCRATCH.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).map_err(|error| Error::tool(error.to_string()))?;
    let outcome = (|| {
        std::fs::write(dir.join(name), source).map_err(|error| Error::tool(error.to_string()))?;
        let output = Command::new(&program)
            .args(["--format=json", name])
            .current_dir(&dir)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| Error::tool(format!("{program}: {error}")))?;
        // oxlint exits 1 when it reports errors; the JSON report is the result either way.
        let report: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|_| Error::tool(failure(&program, &output)))?;
        let diagnostics = report["diagnostics"]
            .as_array()
            .ok_or_else(|| Error::tool(format!("{program}: report has no diagnostics array")))?;
        Ok(diagnostics
            .iter()
            .map(|diagnostic| diagnostic["message"].as_str().unwrap_or_default().to_owned())
            .collect())
    })();
    let _ = std::fs::remove_dir_all(&dir);
    outcome
}
