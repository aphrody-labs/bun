//! System package sources for `systemDependencies` (winget, apk, deb, pacman).
//!
//! `package.json` declares them next to the npm dependency groups:
//!
//! ```json
//! "systemDependencies": { "winget:Microsoft.PowerToys": "^0.100", "apk:curl": "*" }
//! ```
//!
//! Every source implements [`Source`]. Resolution is pure data (index +
//! manifests over HTTP) and runs on every platform, so `bun.lock` gets the same
//! `"system"` block everywhere; installing is only attempted where
//! [`Source::host_can_install`] says so, otherwise it is skipped with a warning
//! (like `optionalDependencies` with a non-matching `os`).
//!
//! The installed-file database lives in `<root>/.bun-system/installed.json`
//! ([`db::InstalledDb`]); `remove`/`upgrade` work from it, without the native
//! package manager (`winget.exe`, `apk`, `apt`, `pacman`).

pub mod apk;
pub mod archive;
pub mod cli;
pub mod db;
pub mod lock;
pub mod mszip;
pub mod net;
pub mod rootfs;
pub mod sqlite;
pub mod value;
pub mod version;

pub mod winget;

use core::fmt;

use bun_core::strings;

pub use db::{InstallKind, InstalledDb, InstalledRecord};
pub use lock::{LockEntry, SystemLock};

/// `package.json` field holding `"<source>:<id>": "<range>"` entries.
pub const PACKAGE_JSON_FIELD: &[u8] = b"systemDependencies";

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum SourceKind {
    Winget,
    Apk,
    Deb,
    Pacman,
}

impl SourceKind {
    pub const ALL: [SourceKind; 4] = [
        SourceKind::Winget,
        SourceKind::Apk,
        SourceKind::Deb,
        SourceKind::Pacman,
    ];

    pub fn name(self) -> &'static str {
        match self {
            SourceKind::Winget => "winget",
            SourceKind::Apk => "apk",
            SourceKind::Deb => "deb",
            SourceKind::Pacman => "pacman",
        }
    }

    /// `apt` is accepted as an alias of `deb`.
    pub fn from_name(name: &[u8]) -> Option<SourceKind> {
        match name {
            b"winget" => Some(SourceKind::Winget),
            b"apk" => Some(SourceKind::Apk),
            b"deb" | b"apt" => Some(SourceKind::Deb),
            b"pacman" => Some(SourceKind::Pacman),
            _ => None,
        }
    }
}

impl fmt::Display for SourceKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.name())
    }
}

/// A parsed `<source>:<id>[@<range>]` specifier (`bun add winget:Microsoft.PowerToys@^0.100`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Spec {
    pub source: SourceKind,
    pub id: String,
    /// `"*"` when omitted.
    pub range: String,
}

impl Spec {
    pub fn key(&self) -> String {
        lock_key(self.source, &self.id)
    }
}

/// `true` when `spec` starts with a known `<source>:` prefix.
pub fn is_system_spec(spec: &[u8]) -> bool {
    split_source(spec).is_some()
}

fn split_source(spec: &[u8]) -> Option<(SourceKind, &[u8])> {
    let colon = strings::index_of_char_usize(spec, b':')?;
    let kind = SourceKind::from_name(&spec[..colon])?;
    let rest = &spec[colon + 1..];
    if rest.is_empty() {
        return None;
    }
    Some((kind, rest))
}

/// Parses `<source>:<id>[@<range>]`. The range separator is the last `@` that
/// is not the first character, so ids never need quoting.
pub fn parse_spec(spec: &[u8]) -> Option<Spec> {
    let (source, rest) = split_source(spec)?;
    let (id, range) = match strings::last_index_of_char(rest, b'@') {
        Some(at) if at > 0 => (&rest[..at], &rest[at + 1..]),
        _ => (rest, &b""[..]),
    };
    if id.is_empty() || strings::index_of_any(id, b" \t\r\n").is_some() {
        return None;
    }
    let id = core::str::from_utf8(id).ok()?;
    let range = core::str::from_utf8(range).ok()?;
    Some(Spec {
        source,
        id: id.to_owned(),
        range: if range.is_empty() { "*".to_owned() } else { range.to_owned() },
    })
}

/// Parses a `systemDependencies` key (`"winget:Microsoft.PowerToys"`) plus its range value.
pub fn parse_entry(key: &[u8], range: &[u8]) -> Option<Spec> {
    let (source, id) = split_source(key)?;
    let id = core::str::from_utf8(id).ok()?;
    let range = core::str::from_utf8(range).ok()?.trim();
    Some(Spec {
        source,
        id: id.to_owned(),
        range: if range.is_empty() { "*".to_owned() } else { range.to_owned() },
    })
}

pub fn lock_key(source: SourceKind, id: &str) -> String {
    let mut key = String::with_capacity(source.name().len() + 1 + id.len());
    key.push_str(source.name());
    key.push(':');
    key.push_str(id);
    key
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Http(String),
    #[error("{0} was not found")]
    NotFound(String),
    #[error("no version of {id} matches \"{range}\"")]
    NoMatchingVersion { id: String, range: String },
    #[error("integrity check failed for {what}: expected sha256 {expected}, got {actual}")]
    Integrity {
        what: String,
        expected: String,
        actual: String,
    },
    #[error("{0}")]
    Parse(String),
    #[error("{0}")]
    Unsupported(String),
    #[error("{0} needs administrator rights; rerun from an elevated shell or set BUN_SYSTEM_ELEVATE=1")]
    NeedsElevation(String),
    #[error("{0}")]
    Io(String),
    #[error("installer for {id} exited with code {code}")]
    InstallerFailed { id: String, code: i64 },
    #[error("{0} is offline and not cached")]
    Offline(String),
}

pub type Result<T> = core::result::Result<T, Error>;

/// Install-time options, read from the environment (`BUN_SYSTEM_*`).
#[derive(Clone, Debug, Default)]
pub struct Options {
    /// `--root`-style alternate install root (`BUN_SYSTEM_ROOT`).
    pub root: Option<Vec<u8>>,
    /// Allow installers that need elevation (`BUN_SYSTEM_ELEVATE=1`).
    pub elevate: bool,
    /// Target architecture override (`BUN_SYSTEM_ARCH`): `x64`, `arm64`, `x86`.
    pub arch: Option<String>,
    /// `user` or `machine` (`BUN_SYSTEM_SCOPE`).
    pub scope: Option<String>,
    /// Preferred installer locale (`BUN_SYSTEM_LOCALE`, e.g. `en-US`).
    pub locale: Option<String>,
    /// Never hit the network; cached indexes/manifests only.
    pub offline: bool,
    /// Re-download indexes even when the cached copy is fresh.
    pub refresh: bool,
}

impl Options {
    pub fn from_env(env: &bun_dotenv::Loader) -> Options {
        let get = |name: &[u8]| -> Option<String> {
            env.get(name)
                .filter(|v| !v.is_empty())
                .map(lossy)
        };
        Options {
            root: env.get(b"BUN_SYSTEM_ROOT").filter(|v| !v.is_empty()).map(<[u8]>::to_vec),
            elevate: matches!(env.get(b"BUN_SYSTEM_ELEVATE"), Some(b"1" | b"true")),
            arch: get(b"BUN_SYSTEM_ARCH"),
            scope: get(b"BUN_SYSTEM_SCOPE"),
            locale: get(b"BUN_SYSTEM_LOCALE"),
            offline: false,
            refresh: matches!(env.get(b"BUN_SYSTEM_REFRESH"), Some(b"1" | b"true")),
        }
    }
}

/// Where a source installs files and records them.
#[derive(Clone, Debug)]
pub struct InstallRoot {
    /// Absolute root directory. Default: `<project>/node_modules/.system`.
    pub dir: Vec<u8>,
    /// Absolute directory receiving command shims. Default: `<project>/node_modules/.bin`.
    pub bin_dir: Vec<u8>,
}

impl InstallRoot {
    pub fn for_project(project_dir: &[u8], options: &Options) -> InstallRoot {
        match &options.root {
            Some(root) => InstallRoot {
                dir: root.clone(),
                bin_dir: join(root, &[b"bin"]),
            },
            None => InstallRoot {
                dir: join(project_dir, &[b"node_modules", b".system"]),
                bin_dir: join(project_dir, &[b"node_modules", b".bin"]),
            },
        }
    }

    /// `<root>/<source>/<id>`: per-package directory for file-based installs.
    pub fn package_dir(&self, source: SourceKind, id: &str) -> Vec<u8> {
        join(&self.dir, &[source.name().as_bytes(), id.as_bytes()])
    }

    pub fn db_path(&self) -> Vec<u8> {
        join(&self.dir, &[b".bun-system", b"installed.json"])
    }
}

/// Everything a [`Source`] needs: environment (proxy, TLS, overrides), cache and options.
pub struct Ctx<'a> {
    pub env: &'a bun_dotenv::Loader,
    /// Absolute `<bun install cache>/system`.
    pub cache_dir: Vec<u8>,
    pub options: Options,
    pub verbose: bool,
}

impl<'a> Ctx<'a> {
    pub fn new(env: &'a bun_dotenv::Loader, install_cache_dir: &[u8], verbose: bool) -> Ctx<'a> {
        Ctx {
            env,
            cache_dir: join(install_cache_dir, &[b"system"]),
            options: Options::from_env(env),
            verbose,
        }
    }

    /// `<cache>/system/<source>`.
    pub fn source_cache_dir(&self, kind: SourceKind) -> Vec<u8> {
        join(&self.cache_dir, &[kind.name().as_bytes()])
    }

    pub fn env_var(&self, name: &[u8]) -> Option<String> {
        self.env
            .get(name)
            .filter(|v| !v.is_empty())
            .map(lossy)
    }

    /// HTTP GET honoring proxies/TLS settings from the environment.
    pub fn fetch(&self, url: &str) -> Result<Vec<u8>> {
        if self.options.offline {
            return Err(Error::Offline(url.to_owned()));
        }
        net::get(self.env, url)
    }

    /// GET `url`, caching the body at `<cache>/system/<source>/<name>`;
    /// a cached copy younger than `max_age_secs` is reused.
    pub fn fetch_cached(
        &self,
        kind: SourceKind,
        name: &str,
        url: &str,
        max_age_secs: u64,
    ) -> Result<Vec<u8>> {
        let path = join(&self.source_cache_dir(kind), &[name.as_bytes()]);
        if !self.options.refresh {
            if let Some((bytes, age)) = fs::read_with_age(&path) {
                if self.options.offline || age <= max_age_secs {
                    return Ok(bytes);
                }
            }
        }
        let bytes = self.fetch(url)?;
        fs::write(&path, &bytes)?;
        Ok(bytes)
    }

    /// GET a content-addressed blob (`sha256` hex), verifying and caching it.
    pub fn fetch_verified(
        &self,
        kind: SourceKind,
        what: &str,
        url: &str,
        sha256_hex: &str,
        extension: &str,
    ) -> Result<(Vec<u8>, Vec<u8>)> {
        let sha = sha256_hex.to_ascii_lowercase();
        let mut name = String::with_capacity(sha.len() + extension.len());
        name.push_str(&sha);
        name.push_str(extension);
        let path = join(&self.source_cache_dir(kind), &[b"blobs", name.as_bytes()]);
        if let Some(bytes) = fs::read(&path) {
            if sha256_hex_of(&bytes) == sha {
                return Ok((bytes, path));
            }
        }
        let bytes = self.fetch(url)?;
        let actual = sha256_hex_of(&bytes);
        if actual != sha {
            return Err(Error::Integrity {
                what: what.to_owned(),
                expected: sha,
                actual,
            });
        }
        fs::write(&path, &bytes)?;
        Ok((bytes, path))
    }
}

#[derive(Clone, Debug, Default)]
pub struct SearchHit {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct PackageInfo {
    pub id: String,
    pub name: String,
    pub latest: String,
    /// Newest first.
    pub versions: Vec<String>,
    pub publisher: Option<String>,
    pub description: Option<String>,
    pub homepage: Option<String>,
    pub license: Option<String>,
}

/// One package source. Implementations live in `system/<source>.rs` (or a
/// `system/<source>/` directory) and are returned by [`source_for`].
pub trait Source {
    fn kind(&self) -> SourceKind;

    /// Whether `install`/`remove` can run on this host. Resolution is always available.
    fn host_can_install(&self, ctx: &Ctx<'_>) -> bool;

    fn search(&mut self, ctx: &Ctx<'_>, query: &str, limit: usize) -> Result<Vec<SearchHit>>;

    fn info(&mut self, ctx: &Ctx<'_>, id: &str) -> Result<PackageInfo>;

    /// Picks the best version of `id` matching `range` and returns the lock entry.
    fn resolve(&mut self, ctx: &Ctx<'_>, id: &str, range: &str) -> Result<LockEntry>;

    /// Installs a locked entry; the returned record goes into the installed db.
    fn install(
        &mut self,
        ctx: &Ctx<'_>,
        entry: &LockEntry,
        root: &InstallRoot,
    ) -> Result<InstalledRecord>;

    fn remove(&mut self, ctx: &Ctx<'_>, record: &InstalledRecord, root: &InstallRoot)
    -> Result<()>;

    /// Version ordering used for ranges and "latest". Sources with their own
    /// rules (dpkg epochs, apk suffixes) override it.
    fn compare_versions(&self, a: &str, b: &str) -> core::cmp::Ordering {
        version::compare(a, b)
    }
}

/// `None` when the source is declared but not implemented yet.
pub fn source_for(kind: SourceKind) -> Option<Box<dyn Source>> {
    match kind {
        SourceKind::Winget => Some(Box::new(winget::Winget::default())),
        SourceKind::Apk => Some(Box::new(apk::Apk)),
        SourceKind::Deb | SourceKind::Pacman => None,
    }
}

pub fn source_or_err(kind: SourceKind) -> Result<Box<dyn Source>> {
    source_for(kind).ok_or_else(|| {
        Error::Unsupported(format!("the \"{kind}\" system source is not implemented yet"))
    })
}

// ── resolution / install drivers (used by `bun install` and `bun pm <source>`) ──

/// Reads `systemDependencies` from a `package.json` file. Unknown sources are errors.
pub fn read_package_json_specs(package_json_path: &[u8]) -> Result<Vec<Spec>> {
    let Some(bytes) = fs::read(package_json_path) else {
        return Ok(Vec::new());
    };
    let root = value::parse_json(&bytes, "package.json")?;
    let mut specs = Vec::new();
    let Some(deps) = root.get("systemDependencies") else {
        return Ok(specs);
    };
    let value::Value::Object(rows) = deps else {
        return Err(Error::Parse(
            "\"systemDependencies\" in package.json must be an object".to_owned(),
        ));
    };
    for (key, range) in rows {
        let range = range.as_str().ok_or_else(|| {
            Error::Parse(format!(
                "\"systemDependencies\".\"{key}\" in package.json must be a string"
            ))
        })?;
        let spec = parse_entry(key.as_bytes(), range.as_bytes()).ok_or_else(|| {
            Error::Parse(format!(
                "invalid system dependency \"{key}\": expected \"<winget|apk|deb|pacman>:<id>\""
            ))
        })?;
        specs.push(spec);
    }
    Ok(specs)
}

/// Builds the new lock from the declared specs, keeping old entries whose
/// specifier did not change (the lock pins versions like npm's).
pub fn resolve_lock(ctx: &Ctx<'_>, specs: &[Spec], old: &SystemLock) -> Result<SystemLock> {
    let mut lock = SystemLock::default();
    let mut sources: Vec<(SourceKind, Box<dyn Source>)> = Vec::new();
    for spec in specs {
        let key = spec.key();
        if let Some(prev) = old.entries.get(&key) {
            if prev.specifier == spec.range {
                lock.entries.insert(key, prev.clone());
                continue;
            }
        }
        let source = match sources.iter_mut().find(|(k, _)| *k == spec.source) {
            Some((_, s)) => s,
            None => {
                sources.push((spec.source, source_or_err(spec.source)?));
                &mut sources.last_mut().expect("just pushed").1
            }
        };
        let mut entry = source.resolve(ctx, &spec.id, &spec.range)?;
        entry.specifier.clone_from(&spec.range);
        lock.entries.insert(key, entry);
    }
    Ok(lock)
}

#[derive(Debug, Default)]
pub struct SyncSummary {
    pub installed: Vec<String>,
    pub removed: Vec<String>,
    pub unchanged: usize,
    /// `(key, reason)` for entries skipped on this host.
    pub skipped: Vec<(String, String)>,
}

/// Installs every locked entry not already recorded in the db with the same
/// version and hash, then removes db records no longer in the lock.
pub fn install_lock(ctx: &Ctx<'_>, lock: &SystemLock, root: &InstallRoot) -> Result<SyncSummary> {
    let mut summary = SyncSummary::default();
    let db_path = root.db_path();
    let mut db = InstalledDb::load(&db_path)?;
    let mut sources: Vec<(SourceKind, Box<dyn Source>)> = Vec::new();

    for (key, entry) in &lock.entries {
        if let Some(rec) = db.entries.get(key) {
            if rec.version == entry.version && rec.hash == entry.hash {
                summary.unchanged += 1;
                continue;
            }
        }
        let Some(source) = get_source(&mut sources, entry.source) else {
            summary
                .skipped
                .push((key.clone(), format!("the \"{}\" source is not implemented yet", entry.source)));
            continue;
        };
        if !source.host_can_install(ctx) {
            summary
                .skipped
                .push((key.clone(), format!("{} packages cannot be installed on this platform", entry.source)));
            continue;
        }
        if let Some(prev) = db.entries.remove(key) {
            source.remove(ctx, &prev, root)?;
            db.save(&db_path)?;
        }
        let record = source.install(ctx, entry, root)?;
        db.entries.insert(key.clone(), record);
        db.save(&db_path)?;
        summary.installed.push(key.clone());
    }

    let stale: Vec<String> = db
        .entries
        .keys()
        .filter(|k| !lock.entries.contains_key(*k))
        .cloned()
        .collect();
    for key in stale {
        let rec = db.entries.get(&key).expect("key from db").clone();
        let Some(source) = get_source(&mut sources, rec.source) else {
            continue;
        };
        if !source.host_can_install(ctx) {
            continue;
        }
        source.remove(ctx, &rec, root)?;
        db.entries.remove(&key);
        db.save(&db_path)?;
        summary.removed.push(key);
    }
    Ok(summary)
}

fn get_source(
    sources: &mut Vec<(SourceKind, Box<dyn Source>)>,
    kind: SourceKind,
) -> Option<&mut Box<dyn Source>> {
    if let Some(i) = sources.iter().position(|(k, _)| *k == kind) {
        return Some(&mut sources[i].1);
    }
    sources.push((kind, source_for(kind)?));
    Some(&mut sources.last_mut().expect("just pushed").1)
}

// ── small shared helpers ──

pub fn sha256_hex_of(bytes: &[u8]) -> String {
    let mut out = [0u8; 32];
    bun_sha_hmac::sha::hashers::SHA256::hash(bytes, &mut out);
    hex(&out)
}

/// UTF-8 text of `bytes`, replacing invalid sequences.
pub fn lossy(bytes: &[u8]) -> String {
    use bstr::ByteSlice as _;
    bytes.to_str_lossy().into_owned()
}

pub fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push(DIGITS[(b >> 4) as usize] as char);
        s.push(DIGITS[(b & 15) as usize] as char);
    }
    s
}

/// Joins path components with the platform separator.
pub fn join(base: &[u8], parts: &[&[u8]]) -> Vec<u8> {
    let sep = if cfg!(windows) { b'\\' } else { b'/' };
    let mut out = base.to_vec();
    for part in parts {
        if part.is_empty() {
            continue;
        }
        if !out.is_empty() && !matches!(out.last(), Some(b'/' | b'\\')) {
            out.push(sep);
        }
        out.extend_from_slice(part);
    }
    out
}

/// File helpers over `bun_sys` with absolute paths.
pub mod fs {
    use super::{Error, Result};

    pub fn read(path: &[u8]) -> Option<Vec<u8>> {
        bun_sys::File::read_from(bun_sys::Fd::cwd(), path).ok()
    }

    /// Contents and age in seconds (from mtime).
    pub fn read_with_age(path: &[u8]) -> Option<(Vec<u8>, u64)> {
        let bytes = read(path)?;
        let age = mtime_age_secs(path).unwrap_or(u64::MAX);
        Some((bytes, age))
    }

    fn mtime_age_secs(path: &[u8]) -> Option<u64> {
        let p = zpath(path);
        let st = bun_sys::stat(bun_core::ZStr::from_buf(&p, path.len())).ok()?;
        let mtime = bun_sys::stat_mtime(&st).sec;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_secs() as i64;
        Some(now.saturating_sub(mtime).max(0) as u64)
    }

    pub fn zpath(path: &[u8]) -> Vec<u8> {
        let mut v = Vec::with_capacity(path.len() + 1);
        v.extend_from_slice(path);
        v.push(0);
        v
    }

    pub fn parent(path: &[u8]) -> &[u8] {
        let slash = bun_core::strings::last_index_of_char(path, b'/');
        let backslash = bun_core::strings::last_index_of_char(path, b'\\');
        match slash.max(backslash) {
            Some(i) => &path[..i],
            None => b"",
        }
    }

    pub fn mkdir_p(dir: &[u8]) -> Result<()> {
        if dir.is_empty() {
            return Ok(());
        }
        bun_sys::mkdir_recursive(dir).map_err(|e| {
            Error::Io(format!("mkdir {}: {}", super::lossy(dir), e))
        })
    }

    /// Writes `data` to `path`, creating parent directories.
    pub fn write(path: &[u8], data: &[u8]) -> Result<()> {
        mkdir_p(parent(path))?;
        let p = zpath(path);
        bun_sys::File::write_file(
            bun_sys::Fd::cwd(),
            bun_core::ZStr::from_buf(&p, path.len()),
            data,
        )
        .map_err(|e| Error::Io(format!("write {}: {}", super::lossy(path), e)))
    }

    pub fn remove_file(path: &[u8]) {
        let p = zpath(path);
        let _ = bun_sys::unlink(bun_core::ZStr::from_buf(&p, path.len()));
    }

    pub fn remove_tree(path: &[u8]) {
        let _ = bun_sys::delete_tree_absolute(path);
    }
}
