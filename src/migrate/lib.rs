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
mod replace_packages;
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
    /// Rewrite the uses of packages that Bun replaces (execa, glob, rimraf, dotenv, node-fetch, ws and others) and
    /// remove the dependencies that no use is left of.
    pub replace_packages: bool,
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

    let manifest_dirs: Vec<Vec<u8>> = paths.iter().filter(|path| bytes::basename(path) == b"package.json").map(|path| bytes::dirname(path).to_vec()).collect();
    let ranges = if options.replace_packages { dependency_ranges(files, &paths) } else { Vec::new() };
    let mut gone: Vec<(Vec<u8>, &str)> = Vec::new();
    let mut kept: Vec<(Vec<u8>, &str)> = Vec::new();
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
        if options.replace_packages && kind == Some(Kind::Source) {
            let owner = owner_of(&manifest_dirs, path);
            let view = current.clone();
            let view = view.as_deref().unwrap_or(&text);
            if replace_packages::mentions_any(view) {
                let before = findings.len();
                let major = |package: &str| ranges.iter().find(|(dir, name, _)| *dir == owner && name == package.as_bytes()).and_then(|(_, _, major)| *major);
                let replaced = replace_packages::rewrite(path, view, &major, &mut findings);
                let final_text = if apply.safe { replaced.text } else { None };
                if !apply.safe {
                    findings[before..].iter_mut().for_each(|finding| finding.applied = false);
                }
                if let Some(new) = &final_text {
                    gone.extend(replaced.gone.iter().map(|package| (owner.clone(), *package)));
                    kept.extend(replace_packages::still_mentioned(new).into_iter().map(|package| (owner.clone(), package)));
                    current = final_text;
                } else {
                    kept.extend(replace_packages::still_mentioned(view).into_iter().map(|package| (owner.clone(), package)));
                }
            }
        }
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

    if options.replace_packages && apply.safe {
        remove_dependencies(files, &gone, &kept, &mut changes, &mut findings);
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

/// The directory of the package.json that a file belongs to: the longest one that holds it.
fn owner_of(manifest_dirs: &[Vec<u8>], path: &[u8]) -> Vec<u8> {
    manifest_dirs.iter().filter(|dir| bytes::is_within(path, dir)).max_by_key(|dir| dir.len()).cloned().unwrap_or_default()
}

/// The major version that each package.json asks for, per package: directory, name and major.
fn dependency_ranges(files: &dyn Files, paths: &[Vec<u8>]) -> Vec<(Vec<u8>, Vec<u8>, Option<u32>)> {
    let mut ranges = Vec::new();
    for path in paths.iter().filter(|path| bytes::basename(path) == b"package.json") {
        let Some(root) = files.read(path).and_then(|text| json::parse(&text).ok()) else { continue };
        for section in [&b"dependencies"[..], b"devDependencies", b"optionalDependencies"] {
            for dep in root.get(section).map_or(&[][..], |deps| deps.members()) {
                let range = dep.value.as_str().unwrap_or(b"");
                let digits: Vec<u8> = range.iter().copied().skip_while(|byte| !byte.is_ascii_digit()).take_while(u8::is_ascii_digit).collect();
                let major = core::str::from_utf8(&digits).ok().and_then(|digits| digits.parse().ok());
                ranges.push((bytes::dirname(path).to_vec(), dep.key.clone(), major));
            }
        }
    }
    ranges
}

/// Removes a dependency from the package.json that owns the files where its last use went away. It stays if a file
/// of the package still names it, or a script of the package.json runs it.
fn remove_dependencies(files: &dyn Files, gone: &[(Vec<u8>, &str)], kept: &[(Vec<u8>, &str)], changes: &mut Vec<(Vec<u8>, Vec<u8>)>, findings: &mut Vec<Finding>) {
    let mut owners: Vec<&Vec<u8>> = gone.iter().map(|(owner, _)| owner).collect();
    owners.sort();
    owners.dedup();
    for owner in owners {
        let path = bytes::join(owner, b"package.json");
        let text = match changes.iter().find(|(changed, _)| *changed == path) {
            Some((_, text)) => text.clone(),
            None => match files.read(&path) {
                Some(text) => text,
                None => continue,
            },
        };
        let Ok(root) = json::parse(&text) else { continue };
        let script_text: Vec<u8> = root.get(b"scripts").map(|node| node.members().iter().filter_map(|member| member.value.as_str().map(<[u8]>::to_vec)).collect::<Vec<_>>().join(&b
)).unwrap_or_default();
        let mut edits = Vec::new();
        for section in [&b"dependencies"[..], b"devDependencies"] {
            let Some(deps) = root.get(section) else { continue };
            for (index, dep) in deps.members().iter().enumerate() {
                let name = core::str::from_utf8(&dep.key).unwrap_or("");
                let used = gone.iter().any(|(gone_owner, package)| gone_owner == owner && *package == name);
                let alive = kept.iter().any(|(kept_owner, package)| kept_owner == owner && *package == name) || bun_core::strings::contains(&script_text, &dep.key);
                if used && !alive {
                    let (start, end) = json::member_span(deps, index);
                    edits.push(scan::Edit { start, end, replacement: Vec::new() });
                    let (line, column) = bytes::LineIndex::new(&text).locate(dep.key_start);
                    findings.push(Finding { file: path.clone(), line, column, rule: b"replace/dependency".to_vec(), severity: Severity::Info, message: format!("{name} is no longer used by this package").into_bytes(), original: dep.key.clone(), replacement: Some(Vec::new()), fixable: true, aggressive: false, applied: true, docs: Vec::new() });
                }
            }
        }
        if !edits.is_empty() {
            let new = scan::apply_edits(&text, edits);
            match changes.iter_mut().find(|(changed, _)| *changed == path) {
                Some(entry) => entry.1 = new,
                None => changes.push((path, new)),
            }
        }
    }
}
