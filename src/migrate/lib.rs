//! `bun migrate`: reads a repository that uses Node.js and another package manager, reports what Bun does differently,
//! rewrites what a rewrite can do safely, and, with `--target rust`, plans what to port to Rust.
//!
//! The engine works on a [`Files`] view of the repository and never touches the file system itself, so the command
//! (in `bun_runtime`) decides how files are listed, read and written. What the engine looks for is data: the TOML files
//! of `registry/`, and those given with `--registry`.
//!
//! The lockfile is not this crate's work: `bun install` already reads `package-lock.json`, `yarn.lock` and
//! `pnpm-lock.yaml`, `pnpm-workspace.yaml`, overrides, patches and catalogs, and writes `bun.lock`.

mod bytes;
mod json;
mod regex;
mod registry;
mod report;
mod rust_plan;
mod scan;
mod toml;
mod workspace;

pub use registry::{RegistryError, Severity};
pub use report::{Format, Report};
pub use rust_plan::{Item, ItemKind, Status};
pub use scan::Finding;
pub use workspace::{Package, Workspace};

use registry::{Kind, Registry};
use scan::{Apply, Manifest, Scanner};

/// The repository, as the engine sees it.
pub trait Files {
    /// Every file, as a path relative to the root with `/` separators.
    fn list(&self) -> Vec<Vec<u8>>;
    fn read(&self, path: &[u8]) -> Option<Vec<u8>>;
    /// `false` if the file could not be written.
    fn write(&mut self, path: &[u8], data: &[u8]) -> bool;
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Bun,
    Rust,
}

pub struct Options {
    /// Apply the safe rewrites.
    pub write: bool,
    /// Apply every rewrite, including those that change behavior. Implies `write`.
    pub aggressive: bool,
    pub target: Target,
    pub format: Format,
    /// Extra registry files: name for messages, and contents.
    pub registries: Vec<(String, Vec<u8>)>,
    /// Changes of rules by id: `None` turns the rule off. An id with a trailing `/` stands for every rule under it.
    pub rules: Vec<(Vec<u8>, Option<Severity>)>,
    /// Paths to leave out: a directory, or a glob of base names.
    pub ignore: Vec<Vec<u8>>,
}

pub struct Outcome {
    pub report: Report,
    /// Warnings and errors that no rewrite has fixed.
    pub remaining: usize,
    pub changed: usize,
}

const MAX_FILE: usize = 8 << 20;

pub fn run(files: &mut dyn Files, options: &Options) -> Result<Outcome, RegistryError> {
    let mut registry = Registry::built_in()?;
    for (name, contents) in &options.registries {
        registry.add(name, contents)?;
    }
    registry.apply_overrides(&options.rules);
    let apply = Apply { safe: options.write || options.aggressive, aggressive: options.aggressive };
    let scanner = Scanner::new(&registry, apply, &options.rules);

    let paths: Vec<Vec<u8>> = {
        let mut paths = files.list();
        paths.retain(|path| !options.ignore.iter().any(|pattern| is_ignored(pattern, path)));
        paths.sort();
        paths
    };

    let mut findings = Vec::new();
    let mut manifests: Vec<Manifest> = Vec::new();
    let mut plan = (options.target == Target::Rust).then(Vec::new);
    let mut changes: Vec<(Vec<u8>, Vec<u8>)> = Vec::new();
    let mut scanned = 0;

    for path in &paths {
        let kind = Kind::of_path(path);
        let named = registry.text.iter().any(|rule| !rule.files.is_empty() && rule.applies_to(None, path));
        let checked = registry.json.iter().any(|rule| rule.applies_to(path));
        let gyp = plan.is_some() && bytes::basename(path) == b"binding.gyp";
        if kind.is_none() && !named && !checked && !gyp {
            continue;
        }
        let Some(text) = files.read(path) else { continue };
        if text.len() > MAX_FILE {
            continue;
        }
        scanned += 1;
        let mut current = match kind {
            Some(Kind::Manifest) => scanner.scan_manifest(path, &text, &mut findings, &mut manifests),
            Some(Kind::Source) => scanner.scan_source(path, &text, &mut findings),
            _ => scanner.rewrite_text(kind, path, &text, None, &mut findings),
        };
        scanner.check_json(path, &text, &mut findings);
        if let Some(items) = plan.as_mut() {
            let view = current.clone();
            let view = view.as_deref().unwrap_or(&text);
            match kind {
                Some(Kind::Manifest) => {
                    if let Some(rewritten) = scanner.plan_manifest(path, view, items) {
                        current = Some(rewritten);
                    }
                }
                Some(Kind::Source) => scanner.plan_source(path, view, items),
                _ if gyp => items.push(Item { kind: ItemKind::Addon, id: b"binding.gyp".to_vec(), file: path.clone(), line: 1, status: Status::Plan, to: b"Rust cdylib loaded with bun:ffi".to_vec(), pin: Vec::new(), note: b"node-gyp build description".to_vec() }),
                _ => {}
            }
        }
        if let Some(new) = current.filter(|new| *new != text) {
            changes.push((path.clone(), new));
        }
    }

    let mut changed = Vec::new();
    for (path, data) in changes {
        if files.write(&path, &data) {
            changed.push(path);
        }
    }

    let workspace = {
        let files: &dyn Files = files;
        workspace::analyze(&paths, &manifests, &|path| files.read(path))
    };
    findings.sort_by(|a, b| (&a.file, a.line, a.column, &a.rule).cmp(&(&b.file, b.line, b.column, &b.rule)));
    let report = Report { files_scanned: scanned, findings, workspace, plan, changed };
    Ok(Outcome { remaining: report.remaining(), changed: report.changed.len(), report })
}

fn is_ignored(pattern: &[u8], path: &[u8]) -> bool {
    match pattern.strip_suffix(b"/**").or_else(|| pattern.strip_suffix(b"/")) {
        Some(dir) => bytes::is_within(path, dir),
        None => bytes::glob_matches(pattern, path) || bytes::glob_matches(pattern, bytes::basename(path)) || bytes::is_within(path, pattern),
    }
}
