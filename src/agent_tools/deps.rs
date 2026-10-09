// SPDX-License-Identifier: Apache-2.0
//! `deps_*`: the installed sources and docs of a project's dependencies
//! (node_modules, the Cargo registry and git checkouts, vendor/), read from
//! disk at the exact versions the project builds against.

use bun_threading::Guarded;
use std::{
    cmp::Ordering,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering as AtomicOrdering},
};

use bun_core::strings;
use regex::bytes::RegexBuilder;
use serde_json::{Map, Value, json};

use crate::{Context, Result, ToolError, args, walk};

const DEFAULT_READ_BYTES: usize = 256 * 1024;
const MAX_TREE_ENTRIES: usize = 2000;
const MAX_LINE_CHARS: usize = 300;
const MAX_SECTION_CHARS: usize = 1500;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Ecosystem {
    Npm,
    Cargo,
    Vendor,
}

impl Ecosystem {
    fn parse(value: Option<&str>) -> Result<Option<Self>> {
        Ok(match value {
            None | Some("") => None,
            Some("npm") => Some(Self::Npm),
            Some("cargo") => Some(Self::Cargo),
            Some("vendor") => Some(Self::Vendor),
            Some(other) => return Err(ToolError::Invalid(format!("unknown ecosystem `{other}`"))),
        })
    }

    fn name(self) -> &'static str {
        match self {
            Self::Npm => "npm",
            Self::Cargo => "cargo",
            Self::Vendor => "vendor",
        }
    }
}

struct Dep {
    name: String,
    ecosystem: Ecosystem,
    version: Option<String>,
    /// Where cargo or the package manager fetched it from (registry or git URL).
    source: Option<String>,
    path: Option<PathBuf>,
}

impl Dep {
    fn to_json(&self) -> Value {
        json!({
            "name": self.name,
            "ecosystem": self.ecosystem.name(),
            "version": self.version,
            "source": self.source,
            "path": self.path.as_deref().map(walk::display),
        })
    }
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_slice(&walk::read(path).ok()?).ok()
}

fn ancestors(root: &Path) -> impl Iterator<Item = &Path> {
    root.ancestors()
}

// ─── npm ────────────────────────────────────────────────────────────────────

fn npm_package_dir(root: &Path, name: &str) -> Option<PathBuf> {
    ancestors(root)
        .map(|dir| dir.join("node_modules").join(name))
        .find(|dir| walk::is_file(&dir.join("package.json")))
}

fn npm_dep(root: &Path, name: &str) -> Dep {
    let path = npm_package_dir(root, name);
    let version = path
        .as_ref()
        .and_then(|dir| read_json(&dir.join("package.json")))
        .and_then(|pkg| pkg["version"].as_str().map(str::to_owned));
    Dep {
        name: name.to_owned(),
        ecosystem: Ecosystem::Npm,
        version,
        source: None,
        path,
    }
}

fn npm_deps(root: &Path) -> Vec<Dep> {
    let Some(pkg) = ancestors(root).find_map(|dir| read_json(&dir.join("package.json"))) else {
        return Vec::new();
    };
    let mut names: Vec<&str> = [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
    ]
    .iter()
    .filter_map(|key| pkg[*key].as_object())
    .flat_map(Map::keys)
    .map(String::as_str)
    .collect();
    names.sort_unstable();
    names.dedup();
    names.into_iter().map(|name| npm_dep(root, name)).collect()
}

// ─── cargo ──────────────────────────────────────────────────────────────────

fn cargo_home() -> Option<PathBuf> {
    if let Some(home) = bun_core::getenv_z(bun_core::zstr!("CARGO_HOME")) {
        return Some(PathBuf::from(bytes_to_string(home)));
    }
    let home = bun_core::env_var::HOME::get()?;
    Some(PathBuf::from(bytes_to_string(home)).join(".cargo"))
}

fn bytes_to_string(bytes: &[u8]) -> String {
    match core::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        // Env values are WTF-8 on Windows; anything else is a path we cannot name.
        Err(_) => String::new(),
    }
}

fn subdirs(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(walker) = ignore::WalkBuilder::new(dir)
        .standard_filters(false)
        .max_depth(Some(1))
        .build()
        .collect::<core::result::Result<Vec<_>, _>>()
    else {
        return out;
    };
    for entry in walker {
        if entry.depth() == 1 && entry.file_type().is_some_and(|kind| kind.is_dir()) {
            out.push(entry.into_path());
        }
    }
    out.sort_unstable();
    out
}

struct CargoIndex {
    registry_roots: Vec<PathBuf>,
    git_checkouts: Vec<PathBuf>,
}

impl CargoIndex {
    fn new() -> Self {
        let Some(home) = cargo_home() else {
            return Self {
                registry_roots: Vec::new(),
                git_checkouts: Vec::new(),
            };
        };
        Self {
            registry_roots: subdirs(&home.join("registry").join("src")),
            git_checkouts: subdirs(&home.join("git").join("checkouts")),
        }
    }

    fn locate(&self, name: &str, version: &str, source: &str) -> Option<PathBuf> {
        if strings::starts_with(source.as_bytes(), b"git+") {
            let (url, commit) = strings::rsplit_once_char(source.as_bytes(), b'#')?;
            let url = strings::split_once_char(url, b'?').map_or(url, |(url, _)| url);
            let repo = strings::rsplit_once_char(url, b'/').map_or(url, |(_, repo)| repo);
            let repo = repo.strip_suffix(b".git").unwrap_or(repo);
            let short = &commit[..commit.len().min(7)];
            let mut prefix = repo.to_vec();
            prefix.push(b'-');
            return self
                .git_checkouts
                .iter()
                .filter(|dir| file_name_starts_with(dir, &prefix))
                .flat_map(|dir| subdirs(dir))
                .find(|dir| file_name_starts_with(dir, short))
                .map(|checkout| find_crate_in_checkout(&checkout, name).unwrap_or(checkout));
        }
        let leaf = format!("{name}-{version}");
        self.registry_roots
            .iter()
            .map(|root| root.join(&leaf))
            .find(|dir| walk::is_file(&dir.join("Cargo.toml")))
    }
}

fn file_name_starts_with(path: &Path, prefix: &[u8]) -> bool {
    path.file_name()
        .is_some_and(|name| strings::starts_with(name.as_encoded_bytes(), prefix))
}

/// A git dependency is usually one member of a workspace checkout.
fn find_crate_in_checkout(checkout: &Path, name: &str) -> Option<PathBuf> {
    let walker = ignore::WalkBuilder::new(checkout)
        .standard_filters(false)
        .max_depth(Some(4))
        .filter_entry(|entry| entry.file_name() != ".git" && entry.file_name() != "target")
        .build();
    let needle = format!("name = \"{name}\"");
    for entry in walker.flatten() {
        if entry.file_name() != "Cargo.toml" {
            continue;
        }
        let Ok(bytes) = walk::read(entry.path()) else {
            continue;
        };
        if strings::contains(&bytes, needle.as_bytes()) {
            return entry.path().parent().map(Path::to_path_buf);
        }
    }
    None
}

fn find_upwards(root: &Path, file: &str) -> Option<PathBuf> {
    ancestors(root)
        .map(|dir| dir.join(file))
        .find(|path| walk::is_file(path))
}

fn cargo_deps(root: &Path) -> Vec<Dep> {
    let Some(lock) = find_upwards(root, "Cargo.lock") else {
        return Vec::new();
    };
    let Ok(bytes) = walk::read(&lock) else {
        return Vec::new();
    };
    let index = CargoIndex::new();
    let mut deps = Vec::new();
    let mut current: Option<(String, String, Option<String>)> = None;
    let flush = |entry: Option<(String, String, Option<String>)>, deps: &mut Vec<Dep>| {
        // No `source`: a workspace member, i.e. the project itself.
        if let Some((name, version, Some(source))) = entry {
            let path = index.locate(&name, &version, &source);
            deps.push(Dep {
                name,
                ecosystem: Ecosystem::Cargo,
                version: Some(version),
                source: Some(source),
                path,
            });
        }
    };
    for line in strings::split(&bytes, b"\n") {
        let line = line.trim_ascii();
        if line == b"[[package]]" {
            flush(current.take(), &mut deps);
            current = Some((String::new(), String::new(), None));
            continue;
        }
        let Some(entry) = current.as_mut() else {
            continue;
        };
        if let Some(value) = toml_string(line, b"name") {
            entry.0 = value;
        } else if let Some(value) = toml_string(line, b"version") {
            entry.1 = value;
        } else if let Some(value) = toml_string(line, b"source") {
            entry.2 = Some(value);
        }
    }
    flush(current.take(), &mut deps);
    deps
}

/// `key = "value"` on one line; enough for Cargo.lock and `[package]` tables.
fn toml_string(line: &[u8], key: &[u8]) -> Option<String> {
    let rest = line.strip_prefix(key)?.trim_ascii_start();
    let rest = rest.strip_prefix(b"=")?.trim_ascii();
    let rest = rest.strip_prefix(b"\"")?;
    let end = strings::index_of_char(rest, b'"')? as usize;
    core::str::from_utf8(&rest[..end]).ok().map(str::to_owned)
}

// ─── vendor ─────────────────────────────────────────────────────────────────

fn vendor_deps(root: &Path) -> Vec<Dep> {
    let Some(vendor) = ancestors(root)
        .map(|dir| dir.join("vendor"))
        .find(|dir| walk::is_dir(dir))
    else {
        return Vec::new();
    };
    subdirs(&vendor)
        .into_iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_string_lossy().into_owned();
            Some(Dep {
                name,
                ecosystem: Ecosystem::Vendor,
                version: None,
                source: None,
                path: Some(path),
            })
        })
        .collect()
}

// ─── lookup ─────────────────────────────────────────────────────────────────

fn discover(root: &Path, only: Option<Ecosystem>) -> Vec<Dep> {
    let wants = |eco| only.is_none_or(|only| only == eco);
    let mut deps = Vec::new();
    if wants(Ecosystem::Npm) {
        deps.extend(npm_deps(root));
    }
    if wants(Ecosystem::Cargo) {
        deps.extend(cargo_deps(root));
    }
    if wants(Ecosystem::Vendor) {
        deps.extend(vendor_deps(root));
    }
    deps
}

fn compare_versions(a: &str, b: &str) -> Ordering {
    let parts = |v: &str| -> Vec<u64> {
        strings::split(v.as_bytes(), b".")
            .map(|part| {
                let digits = part.iter().take_while(|b| b.is_ascii_digit()).count();
                core::str::from_utf8(&part[..digits])
                    .ok()
                    .and_then(|d| d.parse().ok())
                    .unwrap_or(0)
            })
            .collect()
    };
    parts(a).cmp(&parts(b))
}

/// The installed dependency called `name`. npm packages installed transitively
/// (hoisted into node_modules without being in package.json) are found too.
fn resolve(root: &Path, name: &str, only: Option<Ecosystem>) -> Result<Dep> {
    let mut matches: Vec<Dep> = discover(root, only)
        .into_iter()
        .filter(|dep| dep.name == name && dep.path.is_some())
        .collect();
    if matches.is_empty() && only.is_none_or(|eco| eco == Ecosystem::Npm) {
        let dep = npm_dep(root, name);
        if dep.path.is_some() {
            return Ok(dep);
        }
    }
    matches.sort_by(|a, b| {
        a.ecosystem.cmp(&b.ecosystem).then_with(|| {
            compare_versions(
                b.version.as_deref().unwrap_or(""),
                a.version.as_deref().unwrap_or(""),
            )
        })
    });
    matches.into_iter().next().ok_or_else(|| {
        ToolError::NotFound(format!(
            "dependency `{name}` has no sources on disk under {} (run `bun install` or `cargo fetch` first)",
            walk::display(root)
        ))
    })
}

fn dep_args(ctx: &Context<'_>, args: &Value) -> Result<(PathBuf, Dep)> {
    let root = ctx.resolve(args::str(args, "root"));
    let name = args::required(args, "name")?;
    let ecosystem = Ecosystem::parse(args::str(args, "ecosystem"))?;
    let dep = resolve(&root, name, ecosystem)?;
    Ok((root, dep))
}

/// `path` relative to the dependency root, refusing anything that climbs out.
fn inside(base: &Path, path: Option<&str>) -> Result<PathBuf> {
    let Some(path) = path.filter(|p| !p.is_empty() && *p != ".") else {
        return Ok(base.to_path_buf());
    };
    let relative = Path::new(path);
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err(ToolError::Invalid(format!(
            "`path` must be relative to the dependency root: {path}"
        )));
    }
    Ok(base.join(relative))
}

// ─── tools ──────────────────────────────────────────────────────────────────

pub(crate) fn list(ctx: &Context<'_>, args: &Value) -> Result<String> {
    let root = ctx.resolve(args::str(args, "root"));
    let ecosystem = Ecosystem::parse(args::str(args, "ecosystem"))?;
    let filter = args::str(args, "filter").map(str::to_ascii_lowercase);
    let limit = args::usize(args, "limit", 500)?;
    let deps = discover(&root, ecosystem);
    let total = deps.len();
    let entries: Vec<Value> = deps
        .iter()
        .filter(|dep| {
            filter.as_deref().is_none_or(|f| {
                strings::contains(dep.name.to_ascii_lowercase().as_bytes(), f.as_bytes())
            })
        })
        .take(limit)
        .map(Dep::to_json)
        .collect();
    let on_disk = deps.iter().filter(|dep| dep.path.is_some()).count();
    Ok(serde_json::to_string_pretty(&json!({
        "root": walk::display(&root),
        "total": total,
        "on_disk": on_disk,
        "dependencies": entries,
    }))?)
}

fn doc_files(base: &Path) -> Vec<String> {
    let mut docs: Vec<String> = ignore::WalkBuilder::new(base)
        .standard_filters(false)
        .max_depth(Some(1))
        .build()
        .flatten()
        .filter(|entry| entry.depth() == 1)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let upper = name.to_ascii_uppercase();
            let is_doc = strings::starts_with(upper.as_bytes(), b"README")
                || strings::starts_with(upper.as_bytes(), b"CHANGELOG")
                || (entry.file_type().is_some_and(|kind| kind.is_dir())
                    && (name == "docs" || name == "doc"))
                || upper.ends_with(".MD")
                || name.ends_with(".d.ts");
            is_doc.then_some(name)
        })
        .collect();
    docs.sort_unstable();
    docs
}

pub(crate) fn info(ctx: &Context<'_>, args: &Value) -> Result<String> {
    let (_, dep) = dep_args(ctx, args)?;
    let base = dep.path.clone().expect("resolve returns installed deps");
    let mut out = dep.to_json();
    match dep.ecosystem {
        Ecosystem::Npm => {
            if let Some(pkg) = read_json(&base.join("package.json")) {
                for key in [
                    "license",
                    "description",
                    "homepage",
                    "types",
                    "typings",
                    "module",
                    "main",
                ] {
                    if let Some(value) = pkg.get(key).filter(|v| !v.is_null()) {
                        out[key] = value.clone();
                    }
                }
                let repository = match &pkg["repository"] {
                    Value::String(url) => Some(url.clone()),
                    Value::Object(repo) => {
                        repo.get("url").and_then(Value::as_str).map(str::to_owned)
                    }
                    _ => None,
                };
                out["repository"] = json!(repository);
            }
        }
        Ecosystem::Cargo => {
            if let Ok(bytes) = walk::read(&base.join("Cargo.toml")) {
                let mut in_package = false;
                for line in strings::split(&bytes, b"\n") {
                    let line = line.trim_ascii();
                    if line.first() == Some(&b'[') {
                        in_package = line == b"[package]";
                        continue;
                    }
                    if !in_package {
                        continue;
                    }
                    for key in [
                        "license",
                        "description",
                        "homepage",
                        "repository",
                        "documentation",
                    ] {
                        if let Some(value) = toml_string(line, key.as_bytes()) {
                            out[key] = json!(value);
                        }
                    }
                }
            }
        }
        Ecosystem::Vendor => {}
    }
    out["docs"] = json!(doc_files(&base));
    Ok(serde_json::to_string_pretty(&out)?)
}

pub(crate) fn tree(ctx: &Context<'_>, args: &Value) -> Result<String> {
    let (_, dep) = dep_args(ctx, args)?;
    let base = dep.path.clone().expect("resolve returns installed deps");
    let dir = inside(&base, args::str(args, "path"))?;
    if !walk::is_dir(&dir) {
        return Err(ToolError::NotFound(format!(
            "not a directory: {}",
            walk::display(&dir)
        )));
    }
    let depth = args::usize(args, "depth", 2)?.clamp(1, 8);
    let mut entries = Vec::new();
    let mut truncated = false;
    for entry in ignore::WalkBuilder::new(&dir)
        .standard_filters(false)
        .max_depth(Some(depth))
        .sort_by_file_name(|a, b| a.cmp(b))
        .filter_entry(|entry| entry.file_name() != ".git" && entry.file_name() != "node_modules")
        .build()
        .flatten()
    {
        ctx.check()?;
        if entry.depth() == 0 {
            continue;
        }
        if entries.len() == MAX_TREE_ENTRIES {
            truncated = true;
            break;
        }
        let Ok(relative) = entry.path().strip_prefix(&dir) else {
            continue;
        };
        let mut name = walk::display(relative);
        if entry.file_type().is_some_and(|kind| kind.is_dir()) {
            name.push('/');
        }
        entries.push(name);
    }
    Ok(serde_json::to_string_pretty(&json!({
        "name": dep.name,
        "ecosystem": dep.ecosystem.name(),
        "version": dep.version,
        "path": walk::display(&dir),
        "entries": entries,
        "truncated": truncated,
    }))?)
}

pub(crate) fn read(ctx: &Context<'_>, args: &Value) -> Result<String> {
    let (_, dep) = dep_args(ctx, args)?;
    let base = dep.path.clone().expect("resolve returns installed deps");
    let file = inside(&base, Some(args::required(args, "path")?))?;
    let offset = args::usize(args, "offset", 0)?;
    let max = args::usize(args, "max_bytes", DEFAULT_READ_BYTES)?;
    let bytes = walk::read(&file).map_err(|err| match err {
        ToolError::Native(msg) => ToolError::NotFound(format!("{}: {msg}", walk::display(&file))),
        other => other,
    })?;
    let size = bytes.len();
    if walk::is_binary(&bytes) {
        return Ok(serde_json::to_string_pretty(&json!({
            "path": walk::display(&file), "size": size, "binary": true,
        }))?);
    }
    let start = floor_char_boundary(&bytes, offset.min(size));
    let end = floor_char_boundary(&bytes, start.saturating_add(max).min(size));
    let Ok(text) = core::str::from_utf8(&bytes[start..end]) else {
        return Ok(serde_json::to_string_pretty(&json!({
            "path": walk::display(&file), "size": size, "binary": true,
        }))?);
    };
    Ok(serde_json::to_string_pretty(&json!({
        "name": dep.name,
        "version": dep.version,
        "path": walk::display(&file),
        "size": size,
        "offset": start,
        "truncated": end < size,
        "content": text,
    }))?)
}

fn floor_char_boundary(bytes: &[u8], mut index: usize) -> usize {
    while index > 0 && index < bytes.len() && (bytes[index] & 0b1100_0000) == 0b1000_0000 {
        index -= 1;
    }
    index
}

fn clip(text: &[u8], max_chars: usize) -> String {
    let text = core::str::from_utf8(text).unwrap_or("");
    match text.char_indices().nth(max_chars) {
        Some((end, _)) => format!("{}…", &text[..end]),
        None => text.to_owned(),
    }
}

pub(crate) fn search(ctx: &Context<'_>, args: &Value) -> Result<String> {
    let root = ctx.resolve(args::str(args, "root"));
    let query = args::required(args, "query")?;
    let names = args::strings(args, "names")?;
    if names.is_empty() {
        return Err(ToolError::Invalid(
            "`names` must list at least one dependency".into(),
        ));
    }
    let globs = args::strings(args, "glob")?;
    let max = args::usize(args, "max_results", 100)?.max(1);
    let regex = RegexBuilder::new(query)
        .case_insensitive(args::bool(args, "case_insensitive"))
        .size_limit(16 * 1024 * 1024)
        .build()?;
    // Collect past `max` so the reported slice is the sorted head, not whichever
    // worker thread finished first.
    let cap = max.saturating_mul(4).max(1000);
    let mut hits = Vec::new();
    let mut total = 0usize;
    for name in &names {
        let dep = resolve(&root, name, None)?;
        let base = dep.path.clone().expect("resolve returns installed deps");
        let mut found = Guarded::new(Vec::new());
        let count = AtomicUsize::new(0);
        let mut error = Guarded::new(None);
        let exclude = ["node_modules/**".to_owned(), "target/**".to_owned()];
        walk::Walk {
            root: &base,
            include: &globs,
            exclude: &exclude,
            gitignore: false,
            max_depth: None,
        }
        .visit(
            ctx,
            |entry| {
                if count.load(AtomicOrdering::Relaxed) >= cap || entry.size > 8 * 1024 * 1024 {
                    return Ok(());
                }
                let Ok(bytes) = walk::read(&base.join(&entry.relative)) else {
                    return Ok(());
                };
                if walk::is_binary(&bytes) {
                    return Ok(());
                }
                let mut line = 1usize;
                let mut scanned = 0usize;
                let mut local = Vec::new();
                for found in regex.find_iter(&bytes) {
                    line += strings::count_char(&bytes[scanned..found.start()], b'\n');
                    scanned = found.start();
                    let line_start = strings::last_index_of_char(&bytes[..found.start()], b'\n')
                        .map_or(0, |i| i + 1);
                    let line_end = strings::index_of_char(&bytes[found.start()..], b'\n')
                        .map_or(bytes.len(), |i| found.start() + i as usize);
                    let raw = &bytes[line_start..line_end];
                    let text = raw.strip_suffix(b"\r").unwrap_or(raw);
                    local.push((
                        entry.relative.clone(),
                        line,
                        clip(text.trim_ascii(), MAX_LINE_CHARS),
                    ));
                    if count.fetch_add(1, AtomicOrdering::Relaxed) + 1 >= cap {
                        break;
                    }
                }
                found.lock().extend(local);
                Ok(())
            },
            &error,
        );
        if let Some(error) = core::mem::take(error.get_mut()) {
            return Err(error);
        }
        let mut found = core::mem::take(found.get_mut());
        found.sort_unstable_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        total += found.len();
        hits.extend(found.into_iter().map(|(file, line, text)| {
            json!({ "dependency": dep.name, "file": walk::display(&file), "line": line, "text": text })
        }));
    }
    let truncated = hits.len() > max;
    hits.truncate(max);
    Ok(serde_json::to_string_pretty(&json!({
        "query": query,
        "matches": hits,
        "total_seen": total,
        "truncated": truncated,
    }))?)
}

struct Section {
    dependency: String,
    file: String,
    line: usize,
    heading: String,
    body: String,
    score: f64,
}

fn query_terms(query: &str) -> Vec<Vec<u8>> {
    let mut terms: Vec<Vec<u8>> = query
        .as_bytes()
        .split(|b| !(b.is_ascii_alphanumeric() || *b == b'_' || *b == b'$' || *b >= 0x80))
        .filter(|t| t.len() >= 2)
        .map(<[u8]>::to_ascii_lowercase)
        .collect();
    terms.sort_unstable();
    terms.dedup();
    terms
}

fn occurrences(haystack: &[u8], needle: &[u8]) -> usize {
    let mut count = 0;
    let mut rest = haystack;
    while let Some(i) = strings::index_of(rest, needle) {
        count += 1;
        rest = &rest[i + needle.len()..];
    }
    count
}

/// Markdown splits at headings; declaration files at blank-line blocks.
fn sections(text: &[u8], markdown: bool) -> Vec<(usize, &[u8], usize, usize)> {
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut start_line = 1usize;
    let mut heading: &[u8] = b"";
    let mut offset = 0usize;
    let mut in_fence = false;
    for (line_no, line) in (1usize..).zip(strings::split(text, b"\n")) {
        let trimmed = line.trim_ascii();
        if markdown && strings::starts_with(trimmed, b"```") {
            in_fence = !in_fence;
        }
        let boundary = if markdown {
            !in_fence && trimmed.first() == Some(&b'#')
        } else {
            trimmed.is_empty() && offset - start > 400
        };
        if boundary && offset > start {
            out.push((start_line, heading, start, offset));
            start = offset;
            start_line = line_no;
        }
        if markdown && boundary {
            heading = trimmed;
        }
        offset += line.len() + 1;
    }
    if text.len() > start {
        out.push((start_line, heading, start, text.len()));
    }
    out
}

pub(crate) fn docs(ctx: &Context<'_>, args: &Value) -> Result<String> {
    let root = ctx.resolve(args::str(args, "root"));
    let query = args::required(args, "query")?;
    let terms = query_terms(query);
    if terms.is_empty() {
        return Err(ToolError::Invalid("`query` has no searchable words".into()));
    }
    let max = args::usize(args, "max_results", 8)?.clamp(1, 50);
    let names = args::strings(args, "names")?;
    let deps: Vec<Dep> = if names.is_empty() {
        discover(&root, None)
            .into_iter()
            .filter(|dep| dep.ecosystem != Ecosystem::Cargo && dep.path.is_some())
            .collect()
    } else {
        names
            .iter()
            .map(|name| resolve(&root, name, None))
            .collect::<Result<_>>()?
    };
    let include = [
        "*.md".to_owned(),
        "*.mdx".to_owned(),
        "*.markdown".to_owned(),
        "*.d.ts".to_owned(),
        "*.d.mts".to_owned(),
    ];
    let exclude = [
        "node_modules/**".to_owned(),
        "target/**".to_owned(),
        "test/**".to_owned(),
    ];
    let mut found = Guarded::new(Vec::<Section>::new());
    for dep in &deps {
        let base = dep.path.clone().expect("filtered to installed deps");
        let mut error = Guarded::new(None);
        walk::Walk {
            root: &base,
            include: &include,
            exclude: &exclude,
            gitignore: false,
            max_depth: Some(5),
        }
        .visit(
            ctx,
            |entry| {
                if entry.size > 4 * 1024 * 1024 {
                    return Ok(());
                }
                let Ok(bytes) = walk::read(&base.join(&entry.relative)) else {
                    return Ok(());
                };
                let lower = bytes.to_ascii_lowercase();
                if !terms.iter().any(|term| strings::contains(&lower, term)) {
                    return Ok(());
                }
                let file = walk::display(&entry.relative);
                let markdown = !strings::ends_with(file.as_bytes(), b".ts")
                    && !strings::ends_with(file.as_bytes(), b".mts");
                let readme = strings::starts_with(file.to_ascii_uppercase().as_bytes(), b"README");
                let mut local = Vec::new();
                for (line, heading, start, end) in sections(&bytes, markdown) {
                    let body = &lower[start..end];
                    let heading_lower = heading.to_ascii_lowercase();
                    let mut score = 0.0;
                    let mut matched = 0usize;
                    for term in &terms {
                        let hits = occurrences(body, term);
                        if hits > 0 {
                            matched += 1;
                            // Diminishing returns past a few hits, headings count triple.
                            score += (1.0 + hits as f64).ln()
                                + 3.0 * occurrences(&heading_lower, term) as f64;
                        }
                    }
                    if matched == 0 {
                        continue;
                    }
                    score *= matched as f64 / terms.len() as f64;
                    if readme {
                        score *= 1.2;
                    }
                    local.push(Section {
                        dependency: dep.name.clone(),
                        file: file.clone(),
                        line,
                        heading: clip(heading, 200),
                        body: clip(bytes[start..end].trim_ascii(), MAX_SECTION_CHARS),
                        score,
                    });
                }
                found.lock().extend(local);
                Ok(())
            },
            &error,
        );
        if let Some(error) = core::mem::take(error.get_mut()) {
            return Err(error);
        }
    }
    let mut found = core::mem::take(found.get_mut());
    found.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then_with(|| a.dependency.cmp(&b.dependency))
            .then_with(|| a.file.cmp(&b.file))
            .then(a.line.cmp(&b.line))
    });
    let searched: Vec<&str> = deps.iter().map(|dep| dep.name.as_str()).collect();
    let results: Vec<Value> = found
        .iter()
        .take(max)
        .map(|s| {
            json!({
                "dependency": s.dependency,
                "file": s.file,
                "line": s.line,
                "heading": s.heading,
                "score": (s.score * 1000.0).round() / 1000.0,
                "content": s.body,
            })
        })
        .collect();
    Ok(serde_json::to_string_pretty(&json!({
        "query": query,
        "searched": searched,
        "results": results,
    }))?)
}
