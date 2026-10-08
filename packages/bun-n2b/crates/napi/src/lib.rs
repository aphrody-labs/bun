// SPDX-License-Identifier: Apache-2.0

//! Node-API surface of `@aphrody/bun-plugin-n2b`: the n2b CLI, project scans and the per-file codemod
//! the Bun plugin applies at load time.

use std::path::PathBuf;

use aphrody_n2b_core::{
    report, run,
    scanners::source::scan_source,
    types::{FileFix, Mode, Report, RunOptions},
};
use napi::{Error, Result, Status};
use napi_derive::napi;

fn mode(name: Option<&str>) -> Result<Mode> {
    match name.unwrap_or("check") {
        "check" => Ok(Mode::Check),
        "fix" => Ok(Mode::Fix),
        "aggressive" => Ok(Mode::Aggressive),
        other => Err(Error::new(
            Status::InvalidArg,
            format!("n2b mode must be check, fix or aggressive, got {other:?}"),
        )),
    }
}

fn options(root: PathBuf, mode: Mode, ignore: Vec<String>, dry_run: bool) -> RunOptions {
    RunOptions { root, mode, report: Report::Json, quiet: true, ignore, agent: true, dry_run }
}

/// Version of the n2b crates compiled into this addon.
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

/// Runs the n2b CLI in process with `args` (without the program name) and returns its exit status.
#[napi]
pub fn run_cli(args: Vec<String>) -> i32 {
    aphrody_n2b::run_cli(std::iter::once("n2b".to_owned()).chain(args))
}

#[napi(object)]
pub struct ScanOptions {
    /// `check` (default), `fix` or `aggressive`.
    pub mode: Option<String>,
    /// Extra ignore globs.
    pub ignore: Option<Vec<String>>,
    /// Worker threads, 1 to 6.
    pub jobs: Option<u32>,
    /// Compute fixes without writing files. Defaults to true.
    pub dry_run: Option<bool>,
}

/// Scans the project under `root` and returns the n2b JSON report (schema v2).
#[napi]
pub fn scan(root: String, options: Option<ScanOptions>) -> Result<serde_json::Value> {
    let root = PathBuf::from(root);
    if !root.is_dir() {
        return Err(Error::new(
            Status::InvalidArg,
            format!("project root is not a directory: {}", root.display()),
        ));
    }
    let options =
        options.unwrap_or(ScanOptions { mode: None, ignore: None, jobs: None, dry_run: None });
    let opts = self::options(
        root,
        mode(options.mode.as_deref())?,
        options.ignore.unwrap_or_default(),
        options.dry_run.unwrap_or(true),
    );
    let jobs = options.jobs.map_or_else(run::default_jobs, |jobs| jobs as usize);
    let files = run::run_map_with_jobs(&opts, jobs, |fix| Ok(report::json_file(&fix)?))
        .map_err(|error| Error::from_reason(format!("{error:#}")))?;
    Ok(report::json_report(files, &opts))
}

#[napi(object)]
pub struct TransformResult {
    /// Source after the codemods (unchanged in `check` mode).
    pub code: String,
    pub changed: bool,
    /// Findings for this file, in the report's `files[].findings` shape.
    pub findings: serde_json::Value,
}

/// Applies the Node-to-Bun codemods to one source file in memory.
#[napi]
pub fn transform(path: String, source: String, mode: Option<String>) -> Result<TransformResult> {
    let mode = self::mode(mode.as_deref())?;
    let root = PathBuf::from(&path).parent().map(PathBuf::from).unwrap_or_default();
    let opts = options(root, mode, Vec::new(), true);
    let (findings, after) = scan_source(&path, &source, &opts);
    let changed = after != source;
    let fix = FileFix { file: path, before: source, after, findings };
    let entry = report::json_file(&fix).map_err(|error| Error::from_reason(error.to_string()))?;
    Ok(TransformResult {
        code: fix.after,
        changed,
        findings: entry.get("findings").cloned().unwrap_or_default(),
    })
}
