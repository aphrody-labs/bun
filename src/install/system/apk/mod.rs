//! Alpine packages without `apk`: repositories, signatures, solver, extraction,
//! maintainer scripts, triggers and the apk database of a root, ported from
//! apk-tools (GPL-2.0-only, aphrody-labs/apk-tools@44dcdfc, apk-tools 3.0.8):
//! `database.c` (install/purge/triggers), `commit.c` (changeset order, hooks),
//! `package.c` (`apk_pkg_replaces_file`, script runner) and `app_*.c`.

pub mod db;
pub mod index;
pub mod pkg;
pub mod solver;
pub mod version;

use std::collections::{BTreeSet, HashMap, HashSet};

use super::db::{InstallKind, InstalledRecord};
use super::lock::LockEntry;
use super::rootfs::crypto::{Alg, digest, hex_decode};
use super::rootfs::fsops::{Applied, Root};
use super::rootfs::scripts::{self as rscripts, Runner};
use super::rootfs::tar::{self, Entry, Kind};
use super::rootfs::{ArchStyle, IdCache, fnmatch_pathname, list_dir, normalize_arch};
use super::{Ctx, Error, InstallRoot, PackageInfo, Result, SearchHit, Source, SourceKind, fs, hex, join, lossy};
use bun_core::strings;
use db::{Db, Repo};
use index::{Acl, DirRec, FileRec, Pkg};
use pkg::Trust;
use version::Dep;

/// Default repositories when neither the root nor the host configures any.
pub const DEFAULT_REPOSITORIES: [&str; 2] = [
    "https://dl-cdn.alpinelinux.org/alpine/latest-stable/main",
    "https://dl-cdn.alpinelinux.org/alpine/latest-stable/community",
];

/// apk's default index cache lifetime (`--cache-max-age`, 4 hours).
const INDEX_MAX_AGE: u64 = 4 * 3600;

#[derive(Clone, Debug, Default)]
pub struct Settings {
    /// Absolute root directory (`--root`, `/` by default).
    pub root: Vec<u8>,
    /// `--initdb`: create the database when missing.
    pub initdb: bool,
    pub arch: Option<String>,
    /// Extra repository lines (`--repository`, `-X`).
    pub repositories: Vec<String>,
    /// Ignore `etc/apk/repositories*` of the root.
    pub no_system_repositories: bool,
    /// `--keys-dir`: host directory replacing `etc/apk/keys` of the root.
    pub keys_dir: Option<Vec<u8>>,
    pub allow_untrusted: bool,
    pub no_scripts: bool,
    /// `upgrade`, `add -u`: prefer the newest versions over the installed ones.
    pub upgrade: bool,
    /// `update`, `add -U`: refetch the indexes.
    pub update_cache: bool,
    pub force_overwrite: bool,
    pub quiet: bool,
}

enum Replaces {
    Yes,
    No,
    Conflict,
}

fn is_protected(path: &str) -> bool {
    path.starts_with("etc/") && !path.starts_with("etc/apk/")
}

fn split_path(path: &str) -> (&str, &str) {
    match strings::last_index_of_char(path.as_bytes(), b'/') {
        Some(i) => (&path[..i], &path[i + 1..]),
        None => ("", path),
    }
}

fn clean_path(raw: &[u8]) -> String {
    let mut p = raw;
    while let Some(rest) = p.strip_prefix(b"./") {
        p = rest;
    }
    while let Some(rest) = p.strip_prefix(b"/") {
        p = rest;
    }
    while let Some(rest) = p.strip_suffix(b"/") {
        p = rest;
    }
    lossy(p)
}

/// Host path for `file://`, `/abs` and `C:/abs` URLs.
fn local_path(url: &str) -> Option<&str> {
    let p = url.strip_prefix("file://").unwrap_or(url);
    let b = p.as_bytes();
    if b.first() == Some(&b'/') || (b.len() > 2 && b[1] == b':' && b[0].is_ascii_alphabetic()) {
        Some(p)
    } else {
        None
    }
}

fn arch_ok(arches: &[String], arch: &str) -> bool {
    arch.is_empty() || arch == "noarch" || arches.iter().any(|a| a == arch)
}

/// `apk_fileinfo_hash_xattr`: SHA-1 over the sorted `(name, value)` pairs, each
/// prefixed by its big-endian 32-bit length.
fn xattr_digest(e: &Entry<'_>) -> Option<Vec<u8>> {
    let mut list: Vec<(&[u8], &[u8])> = e.xattrs().collect();
    if list.is_empty() {
        return None;
    }
    list.sort();
    let mut h = super::rootfs::crypto::Hasher::new(Alg::Sha1);
    for (k, v) in list {
        h.update(&(k.len() as u32).to_be_bytes());
        h.update(k);
        h.update(&(v.len() as u32).to_be_bytes());
        h.update(v);
    }
    Some(h.finish())
}

fn file_digest(p: &Pkg, path: &str) -> Option<Vec<u8>> {
    let (dir, base) = split_path(path);
    p.dirs
        .iter()
        .find(|d| d.name == dir)?
        .files
        .iter()
        .find(|f| f.name == base)?
        .digest
        .clone()
}

pub struct Engine<'a, 'e> {
    ctx: &'a Ctx<'e>,
    pub settings: Settings,
    pub root: Root,
    pub db: Db,
    trust: Trust,
    pub repos: Vec<Repo>,
    /// Repository packages, then installed-only records.
    pub pool: Vec<Pkg>,
    repo_pool_len: usize,
    indexes_loaded: bool,
    ids: IdCache,
    runner: Option<Runner>,
    warned_scripts: bool,
    pub errors: usize,
    owners: HashMap<String, String>,
    modified_dirs: HashSet<String>,
    run_all: HashSet<String>,
    changed: Vec<String>,
    to_be_removed: HashSet<String>,
    skipped: usize,
}

impl<'a, 'e> Engine<'a, 'e> {
    pub fn open(ctx: &'a Ctx<'e>, settings: Settings) -> Result<Engine<'a, 'e>> {
        let root = Root::new(&settings.root);
        if settings.initdb {
            fs::mkdir_p(&root.dir)?;
            root.mkdirs(b"lib/apk/db", 0o755)?;
            root.mkdirs(b"etc/apk", 0o755)?;
        }
        let arch = settings.arch.as_deref().map(|a| normalize_arch(ArchStyle::Apk, a));
        let db = Db::open(&root, settings.initdb, arch.as_deref())?;
        let key_dirs = match &settings.keys_dir {
            Some(d) => vec![d.clone()],
            None => db.key_dirs(),
        };
        let trust = Trust::load(&key_dirs, settings.allow_untrusted);
        let mut repos = if settings.no_system_repositories { Vec::new() } else { db.repositories() };
        for line in &settings.repositories {
            for r in Repo::expand(line, db.arch()) {
                if !repos.iter().any(|x: &Repo| x.index_url == r.index_url) {
                    repos.push(r);
                }
            }
        }
        let ids = IdCache::load(&root);
        let mut owners = HashMap::new();
        for p in &db.installed {
            for path in p.file_paths() {
                owners.insert(path, p.name.clone());
            }
        }
        Ok(Engine {
            ctx,
            settings,
            root,
            db,
            trust,
            repos,
            pool: Vec::new(),
            repo_pool_len: 0,
            indexes_loaded: false,
            ids,
            runner: None,
            warned_scripts: false,
            errors: 0,
            owners,
            modified_dirs: HashSet::new(),
            run_all: HashSet::new(),
            changed: Vec::new(),
            to_be_removed: HashSet::new(),
            skipped: 0,
        })
    }

    fn msg(&self, text: &str) {
        if !self.settings.quiet {
            bun_core::pretty_errorln!("{}", text);
        }
    }

    fn error(&mut self, text: &str) {
        self.errors += 1;
        bun_core::pretty_errorln!("<r><red>ERROR<r>: {}", text);
    }

    fn warning(&self, text: &str) {
        bun_core::pretty_errorln!("<r><yellow>WARNING<r>: {}", text);
    }

    fn fetch_index(&self, repo: &Repo) -> Result<Vec<u8>> {
        if let Some(path) = local_path(&repo.index_url) {
            return fs::read(path.as_bytes()).ok_or_else(|| Error::NotFound(repo.index_url.clone()));
        }
        let hash = hex(&digest(Alg::Sha256, repo.index_url.as_bytes()));
        let name = format!("APKINDEX.{}.tar.gz", &hash[..8]);
        let max_age = if self.settings.update_cache { 0 } else { INDEX_MAX_AGE };
        self.ctx.fetch_cached(SourceKind::Apk, &name, &repo.index_url, max_age)
    }

    /// Loads every repository index (once); unavailable ones are warnings, like apk.
    pub fn load_indexes(&mut self) -> Result<()> {
        if self.indexes_loaded {
            return Ok(());
        }
        self.indexes_loaded = true;
        let arches = self.db.arches.clone();
        for i in 0..self.repos.len() {
            let repo = self.repos[i].clone();
            let loaded = self
                .fetch_index(&repo)
                .and_then(|bytes| pkg::read_index(&bytes, &self.trust, i, &repo.index_url));
            match loaded {
                Ok(index) => {
                    if self.settings.update_cache && !self.settings.quiet {
                        self.msg(&format!("{} [{}]", index.description, repo.url));
                    }
                    self.pool.extend(index.packages.into_iter().filter(|p| arch_ok(&arches, &p.arch)));
                }
                Err(err) => self.warning(&format!("opening {}: {err}", repo.url)),
            }
        }
        self.repo_pool_len = self.pool.len();
        Ok(())
    }

    fn installed_indices(&mut self) -> Vec<usize> {
        self.pool.truncate(self.repo_pool_len);
        let mut out = Vec::with_capacity(self.db.installed.len());
        for p in &self.db.installed {
            let found = self.pool[..self.repo_pool_len].iter().position(|q| {
                q.name == p.name && q.version == p.version && (p.identity.is_empty() || q.identity == p.identity)
            });
            match found {
                Some(j) => out.push(j),
                None => {
                    self.pool.push(Pkg { repo: None, ..p.clone() });
                    out.push(self.pool.len() - 1);
                }
            }
        }
        out
    }

    pub fn solve(&mut self, world: &[Dep]) -> Result<Vec<usize>> {
        self.load_indexes()?;
        let installed = self.installed_indices();
        let tags: Vec<Option<String>> = self.repos.iter().map(|r| r.tag.clone()).collect();
        solver::Solver::new(&self.pool, &installed, &tags, self.settings.upgrade)
            .solve(world)
            .map_err(|p| Error::Parse(format!("unable to select packages:\n  {}", p.0)))
    }

    fn fetch_package(&self, p: &Pkg) -> Result<pkg::ApkFile> {
        let repo = p.repo.and_then(|r| self.repos.get(r)).ok_or_else(|| {
            Error::NotFound(format!("{} in any configured repository", p.name_version()))
        })?;
        let url = repo.package_url(p, self.db.arch());
        let what = p.file_name();
        let identity = (!p.identity.is_empty()).then_some(p.identity.as_slice());
        if let Some(path) = local_path(&url) {
            let bytes = fs::read(path.as_bytes()).ok_or_else(|| Error::NotFound(url.clone()))?;
            return pkg::read_package(&bytes, identity, &self.trust, &what);
        }
        let id_hex = hex(&p.identity);
        let cache_name = format!("{}-{}.{}.apk", p.name, p.version, &id_hex[..id_hex.len().min(8)]);
        let cache = join(&self.ctx.source_cache_dir(SourceKind::Apk), &[b"pkgs", cache_name.as_bytes()]);
        if let Some(bytes) = fs::read(&cache) {
            if let Ok(file) = pkg::read_package(&bytes, identity, &self.trust, &what) {
                return Ok(file);
            }
        }
        let bytes = self.ctx.fetch(&url)?;
        let file = pkg::read_package(&bytes, identity, &self.trust, &what)?;
        fs::write(&cache, &bytes)?;
        Ok(file)
    }

    fn run_script(&mut self, name: &str, version: &str, kind: &str, body: &[u8], args: &[String]) -> bool {
        if self.settings.no_scripts {
            return true;
        }
        if !rscripts::SUPPORTED {
            if !self.warned_scripts {
                self.warning("maintainer scripts are skipped: they only run on Linux");
                self.warned_scripts = true;
            }
            return true;
        }
        self.msg(&format!("Executing {name}-{version}.{kind}"));
        let root = &self.root;
        let runner = self.runner.get_or_insert_with(|| Runner::new(root));
        let exec = format!("lib/apk/exec/{name}-{version}.{kind}");
        let argv: Vec<&[u8]> = args.iter().map(String::as_bytes).collect();
        let env: [(&[u8], &[u8]); 2] = [(b"APK_SCRIPT", kind.as_bytes()), (b"APK_PACKAGE", name.as_bytes())];
        let result = runner.run(exec.as_bytes(), body, &argv, &env);
        self.ids = IdCache::load(&self.root);
        match result {
            Ok(0) => true,
            Ok(code) => {
                self.error(&format!("{name}-{version}.{kind}: script exited with error {code}"));
                false
            }
            Err(err) => {
                self.error(&format!("{name}-{version}.{kind}: {err}"));
                false
            }
        }
    }

    fn run_commit_hooks(&mut self, kind: &str) {
        if self.settings.no_scripts || !rscripts::SUPPORTED {
            return;
        }
        let dir = self.root.resolved_host(b"etc/apk/commit_hooks.d");
        for name in list_dir(&dir) {
            if name.first() == Some(&b'.') {
                continue;
            }
            let path = format!("/etc/apk/commit_hooks.d/{}", lossy(&name));
            self.msg(&format!("Executing {} {kind}", lossy(&name)));
            let root = &self.root;
            let runner = self.runner.get_or_insert_with(|| Runner::new(root));
            let argv: [&[u8]; 2] = [path.as_bytes(), kind.as_bytes()];
            let env: [(&[u8], &[u8]); 1] = [(b"APK_SCRIPT", kind.as_bytes())];
            match runner.run_program(&argv, &env) {
                Ok(0) => {}
                Ok(code) => self.error(&format!("{path}: exited with error {code}")),
                Err(err) => self.error(&format!("{path}: {err}")),
            }
        }
    }

    fn replaces_file(&self, owner: &str, new: &Pkg) -> Replaces {
        let Some(o) = self.db.installed_by_name(owner) else {
            return Replaces::Yes;
        };
        if self.to_be_removed.contains(owner) {
            return Replaces::Yes;
        }
        let prio = |by: &Pkg, of: &Pkg| -> i64 {
            if by.replaces.iter().any(|d| d.name == of.name && d.matches_version(Some(&of.version))) {
                i64::from(by.replaces_priority)
            } else {
                -1
            }
        };
        let (a, b) = (prio(o, new), prio(new, o));
        if a > b {
            return Replaces::No;
        }
        if b >= 0 {
            return Replaces::Yes;
        }
        if !o.origin.is_empty() && o.origin == new.origin {
            return Replaces::Yes;
        }
        Replaces::Conflict
    }

    fn disown(&mut self, owner: &str, path: &str) {
        let (dir, base) = split_path(path);
        if let Some(p) = self.db.installed.iter_mut().find(|p| p.name == owner) {
            if let Some(d) = p.dirs.iter_mut().find(|d| d.name == dir) {
                d.files.retain(|f| f.name != base);
            }
        }
    }

    fn apply(&mut self, e: &Entry<'_>, path: &str, owner: (u32, u32), data: &[u8]) -> Result<()> {
        if let Applied::Skipped(why) = self.root.apply(e, path.as_bytes(), owner, data)? {
            self.skipped += 1;
            if self.ctx.verbose {
                self.warning(&why);
            }
        }
        Ok(())
    }

    fn extract(&mut self, data: &[u8], rec: &mut Pkg, old: Option<&Pkg>) -> Result<()> {
        let mut reader = tar::Reader::new(data);
        while let Some(e) = reader.next_entry()? {
            let path = clean_path(&e.path);
            if path.is_empty() {
                continue;
            }
            let owner = self.ids.resolve(&e.uname, &e.gname, e.uid, e.gid);
            let acl = Acl { uid: owner.0, gid: owner.1, mode: e.mode & 0o7777, xattr_digest: xattr_digest(&e) };
            if e.kind == Kind::Dir {
                match rec.dirs.iter_mut().find(|d| d.name == path) {
                    Some(d) => d.acl = Some(acl),
                    None => rec.dirs.push(DirRec { name: path.clone(), acl: Some(acl), files: Vec::new() }),
                }
                self.apply(&e, &path, owner, &[])?;
                continue;
            }
            let (dir, base) = split_path(&path);
            let (dir, base) = (dir.to_owned(), base.to_owned());
            if !rec.dirs.iter().any(|d| d.name == dir) {
                rec.dirs.push(DirRec { name: dir.clone(), acl: None, files: Vec::new() });
            }
            if let Some(current) = self.owners.get(&path).cloned() {
                if current != rec.name {
                    match self.replaces_file(&current, rec) {
                        Replaces::Yes => self.disown(&current, &path),
                        Replaces::No => continue,
                        Replaces::Conflict if self.settings.force_overwrite => {
                            self.warning(&format!("{}: overwriting {path} owned by {current}.", rec.name_version()));
                            self.disown(&current, &path);
                        }
                        Replaces::Conflict => {
                            let who = self.db.installed_by_name(&current).map_or(current.clone(), Pkg::name_version);
                            self.error(&format!("{}: trying to overwrite {path} owned by {who}.", rec.name_version()));
                            if !strings::contains_char(rec.broken.as_bytes(), b'f') {
                                rec.broken.push('f');
                            }
                            continue;
                        }
                    }
                }
            }
            let pax_sum = e
                .pax_value(b"APK-TOOLS.checksum.SHA1")
                .and_then(hex_decode)
                .filter(|d| d.len() == 20);
            let file_sum = match e.kind {
                Kind::File => {
                    let actual = digest(Alg::Sha1, e.data);
                    if let Some(expected) = &pax_sum {
                        if *expected != actual {
                            return Err(Error::Integrity {
                                what: format!("{} ({path})", rec.file_name()),
                                expected: index::encode_digest(expected),
                                actual: index::encode_digest(&actual),
                            });
                        }
                    }
                    Some(actual)
                }
                Kind::Hardlink => file_digest(rec, &clean_path(&e.link)),
                Kind::Symlink => pax_sum.or_else(|| Some(digest(Alg::Sha1, &e.link))),
                _ => pax_sum,
            };
            let mut target = path.clone();
            if e.kind == Kind::File && is_protected(&path) {
                if let Some(existing) = self.root.digest(path.as_bytes(), Alg::Sha1) {
                    let recorded = old.and_then(|o| file_digest(o, &path));
                    if file_sum.as_ref() != Some(&existing) && recorded.as_ref() != Some(&existing) {
                        target = format!("{path}.apk-new");
                    }
                }
            }
            self.apply(&e, &target, owner, e.data)?;
            if let Some(d) = rec.dirs.iter_mut().find(|d| d.name == dir) {
                d.files.push(FileRec { name: base, acl: Some(acl), digest: file_sum });
            }
            self.owners.insert(path, rec.name.clone());
            self.modified_dirs.insert(dir);
        }
        Ok(())
    }

    fn dir_used_by_others(&self, dir: &str, except: &str) -> bool {
        self.db.installed.iter().any(|p| p.name != except && p.dirs.iter().any(|d| d.name == dir))
    }

    fn remove_file(&mut self, path: &str, recorded: Option<&Vec<u8>>) {
        if is_protected(path) {
            if let Some(current) = self.root.digest(path.as_bytes(), Alg::Sha1) {
                if recorded.is_some_and(|r| *r != current) {
                    return;
                }
            }
        }
        self.root.remove(path.as_bytes());
        self.modified_dirs.insert(split_path(path).0.to_owned());
    }

    /// Removes the files and directories of `old` that `keep` (its replacement) no longer ships.
    fn purge(&mut self, old: &Pkg, keep: Option<&Pkg>) {
        let kept: HashSet<String> = keep.map(Pkg::file_paths).unwrap_or_default().into_iter().collect();
        for d in &old.dirs {
            for f in &d.files {
                let path = if d.name.is_empty() { f.name.clone() } else { format!("{}/{}", d.name, f.name) };
                if kept.contains(&path) {
                    continue;
                }
                if self.owners.get(&path).is_some_and(|o| *o != old.name) {
                    continue;
                }
                self.remove_file(&path, f.digest.as_ref());
                self.owners.remove(&path);
            }
        }
        let kept_dirs: HashSet<&str> = keep.map(|k| k.dirs.iter().map(|d| d.name.as_str()).collect()).unwrap_or_default();
        for d in old.dirs.iter().rev() {
            if d.name.is_empty() || kept_dirs.contains(d.name.as_str()) || self.dir_used_by_others(&d.name, &old.name) {
                continue;
            }
            self.root.remove(d.name.as_bytes());
        }
    }

    fn uninstall(&mut self, old: &Pkg) {
        let args = vec![old.version.clone()];
        let scripts = self.db.scripts.get(&old.identity).cloned().unwrap_or_default();
        let script = |kind: &str| scripts.iter().find(|(k, _)| *k == kind).map(|(_, b)| b.clone());
        if let Some(body) = script("pre-deinstall") {
            self.run_script(&old.name, &old.version, "pre-deinstall", &body, &args);
        }
        self.purge(old, None);
        if let Some(body) = script("post-deinstall") {
            self.run_script(&old.name, &old.version, "post-deinstall", &body, &args);
        }
        self.db.installed.retain(|p| p.name != old.name);
        self.db.scripts.remove(&old.identity);
        self.db.triggers.remove(&old.identity);
    }

    fn install(&mut self, p: &Pkg, old: Option<&Pkg>) -> Result<()> {
        let file = self.fetch_package(p)?;
        let mut rec = Pkg { repo: None, dirs: Vec::new(), broken: String::new(), ..p.clone() };
        rec.replaces.clone_from(&file.info.replaces);
        rec.replaces_priority = file.info.replaces_priority;
        if rec.identity.is_empty() {
            rec.identity.clone_from(&file.info.identity);
        }
        let (pre, post, args) = match old {
            Some(o) => ("pre-upgrade", "post-upgrade", vec![p.version.clone(), o.version.clone()]),
            None => ("pre-install", "post-install", vec![p.version.clone()]),
        };
        if let Some(body) = file.script(pre) {
            if !self.run_script(&p.name, &p.version, pre, body, &args) {
                rec.broken.push('s');
            }
        }
        self.extract(&file.data, &mut rec, old)?;
        if let Some(o) = old {
            let current = self.db.installed_by_name(&o.name).cloned().unwrap_or_else(|| o.clone());
            self.purge(&current, Some(&rec));
            self.db.scripts.remove(&o.identity);
            self.db.triggers.remove(&o.identity);
            self.db.installed.retain(|x| x.name != o.name);
        }
        if let Some(body) = file.script(post) {
            if !self.run_script(&p.name, &p.version, post, body, &args) && !strings::contains_char(rec.broken.as_bytes(), b's') {
                rec.broken.push('s');
            }
        }
        if !file.scripts.is_empty() {
            self.db.scripts.insert(rec.identity.clone(), file.scripts.clone());
        }
        if !file.triggers.is_empty() {
            self.db.triggers.insert(rec.identity.clone(), file.triggers.clone());
        }
        self.run_all.insert(rec.name.clone());
        self.changed.push(rec.name.clone());
        self.db.installed.push(rec);
        Ok(())
    }

    fn run_triggers(&mut self) {
        let dirs: BTreeSet<String> =
            self.db.installed.iter().flat_map(|p| p.dirs.iter().map(|d| d.name.clone())).collect();
        let changed = core::mem::take(&mut self.changed);
        for name in changed {
            let Some(p) = self.db.installed_by_name(&name) else {
                continue;
            };
            let Some(triggers) = self.db.triggers.get(&p.identity).cloned() else {
                continue;
            };
            let Some(body) = self
                .db
                .scripts
                .get(&p.identity)
                .and_then(|s| s.iter().find(|(k, _)| *k == "trigger"))
                .map(|(_, b)| b.clone())
            else {
                continue;
            };
            let (pname, pver) = (p.name.clone(), p.version.clone());
            let run_all = self.run_all.contains(&name);
            let mut pending = false;
            let mut args = Vec::new();
            for dir in &dirs {
                let modified = self.modified_dirs.contains(dir);
                if !run_all && !modified {
                    continue;
                }
                let rooted = format!("/{dir}");
                for t in &triggers {
                    let (only_changed, pattern) = match t.strip_prefix('+') {
                        Some(rest) => (true, rest),
                        None => (false, t.as_str()),
                    };
                    if !pattern.starts_with('/') || !fnmatch_pathname(pattern.as_bytes(), rooted.as_bytes()) {
                        continue;
                    }
                    pending = true;
                    if !only_changed || modified {
                        args.push(rooted.clone());
                    }
                    break;
                }
            }
            if pending {
                self.run_script(&pname, &pver, "trigger", &body, &args);
            }
        }
    }

    /// Applies the solver result: removals, then installs/upgrades in
    /// dependency order, triggers, and the database.
    pub fn commit(&mut self, world: Vec<Dep>, order: &[usize], reinstall: &HashSet<String>) -> Result<()> {
        let new_names: HashSet<&str> = order.iter().map(|&i| self.pool[i].name.as_str()).collect();
        let removals: Vec<Pkg> =
            self.db.installed.iter().filter(|p| !new_names.contains(p.name.as_str())).cloned().collect();
        let mut installs: Vec<(Pkg, Option<Pkg>)> = Vec::new();
        for &i in order {
            let p = &self.pool[i];
            let old = self.db.installed_by_name(&p.name).cloned();
            if let Some(o) = &old {
                if o.version == p.version && o.identity == p.identity && !reinstall.contains(&p.name) {
                    continue;
                }
            }
            installs.push((p.clone(), old));
        }
        self.to_be_removed = removals
            .iter()
            .map(|p| p.name.clone())
            .chain(installs.iter().filter_map(|(_, o)| o.as_ref().map(|o| o.name.clone())))
            .collect();
        let total = removals.len() + installs.len();
        if total > 0 {
            self.run_commit_hooks("pre-commit");
        }
        let width = total.to_string().len();
        let mut n = 0usize;
        for old in &removals {
            n += 1;
            self.msg(&format!("({n:>width$}/{total}) Purging {}", old.name_version()));
            self.uninstall(old);
        }
        for (p, old) in &installs {
            n += 1;
            let line = match old {
                None => format!("Installing {} ({})", p.name, p.version),
                Some(o) => match version::compare(&p.version, &o.version) {
                    core::cmp::Ordering::Greater => format!("Upgrading {} ({} -> {})", p.name, o.version, p.version),
                    core::cmp::Ordering::Less => format!("Downgrading {} ({} -> {})", p.name, o.version, p.version),
                    core::cmp::Ordering::Equal => format!("Reinstalling {} ({})", p.name, p.version),
                },
            };
            self.msg(&format!("({n:>width$}/{total}) {line}"));
            self.install(p, old.as_ref())?;
        }
        if total > 0 {
            self.run_triggers();
        }
        self.db.world = world;
        self.db.write()?;
        if total > 0 {
            self.run_commit_hooks("post-commit");
        }
        if self.skipped > 0 {
            self.warning(&format!(
                "{} entries could not be created on this host (device nodes need root, symlinks need permission)",
                self.skipped
            ));
        }
        let bytes: u64 = self.db.installed.iter().map(|p| p.installed_size).sum();
        let summary = format!("{} MiB in {} packages", bytes.div_ceil(1024 * 1024), self.db.installed.len());
        if self.errors > 0 {
            let s = if self.errors > 1 { "s" } else { "" };
            self.msg(&format!("{} error{s}; {summary}", self.errors));
            return Err(Error::Io(format!("{} error{s} while committing changes", self.errors)));
        }
        self.msg(&format!("OK: {summary}"));
        Ok(())
    }

    // ── applets ──

    pub fn add(&mut self, specs: &[String]) -> Result<()> {
        let mut world = self.db.world.clone();
        for s in specs {
            let dep = Dep::parse(s).ok_or_else(|| Error::Parse(format!("'{s}' is not a correctly formatted world dependency")))?;
            world.retain(|d| d.name != dep.name);
            world.push(dep);
        }
        let order = self.solve(&world)?;
        self.commit(world, &order, &HashSet::new())
    }

    pub fn del(&mut self, names: &[String]) -> Result<()> {
        let mut world = self.db.world.clone();
        for name in names {
            let before = world.len();
            world.retain(|d| d.name != *name);
            if world.len() == before {
                self.warning(&format!("No such package: {name}"));
            }
        }
        let order = self.solve(&world)?;
        self.commit(world, &order, &HashSet::new())
    }

    pub fn upgrade(&mut self) -> Result<()> {
        self.settings.upgrade = true;
        let world = self.db.world.clone();
        let order = self.solve(&world)?;
        self.commit(world, &order, &HashSet::new())
    }

    /// Reinstalls `names` (every installed package when empty).
    pub fn fix(&mut self, names: &[String]) -> Result<()> {
        let reinstall: HashSet<String> = if names.is_empty() {
            self.db.installed.iter().map(|p| p.name.clone()).collect()
        } else {
            names.iter().cloned().collect()
        };
        let world = self.db.world.clone();
        let order = self.solve(&world)?;
        self.commit(world, &order, &reinstall)
    }

    pub fn update(&mut self) -> Result<usize> {
        self.settings.update_cache = true;
        self.load_indexes()?;
        let names: HashSet<&str> = self.pool.iter().map(|p| p.name.as_str()).collect();
        Ok(names.len())
    }

    /// Newest package per name whose name (or description with `descriptions`) matches.
    pub fn search(&mut self, patterns: &[String], descriptions: bool) -> Result<Vec<Pkg>> {
        self.load_indexes()?;
        let mut best: HashMap<&str, &Pkg> = HashMap::new();
        for p in &self.pool[..self.repo_pool_len] {
            let hit = patterns.is_empty()
                || patterns.iter().any(|pat| {
                    let glob = strings::index_of_any(pat.as_bytes(), b"*?[").is_some();
                    let matches = |text: &str| {
                        if glob {
                            fnmatch_pathname(pat.as_bytes(), text.as_bytes())
                        } else {
                            strings::contains(text.as_bytes(), pat.as_bytes())
                        }
                    };
                    matches(&p.name) || (descriptions && matches(&p.description))
                });
            if !hit {
                continue;
            }
            match best.get(p.name.as_str()) {
                Some(q) if version::compare(&q.version, &p.version) != core::cmp::Ordering::Less => {}
                _ => {
                    best.insert(p.name.as_str(), p);
                }
            }
        }
        let mut out: Vec<Pkg> = best.into_values().cloned().collect();
        out.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(out)
    }

    /// `apk audit`: `U` modified, `X` missing (files of installed packages).
    pub fn audit(&self) -> Vec<(char, String)> {
        let mut out = Vec::new();
        for p in &self.db.installed {
            for d in &p.dirs {
                for f in &d.files {
                    let path = if d.name.is_empty() { f.name.clone() } else { format!("{}/{}", d.name, f.name) };
                    match self.root.digest(path.as_bytes(), Alg::Sha1) {
                        None if !self.root.exists(path.as_bytes()) => out.push(('X', path)),
                        Some(actual) if f.digest.as_ref().is_some_and(|d| d.len() == 20 && *d != actual) => {
                            out.push(('U', path));
                        }
                        _ => {}
                    }
                }
            }
        }
        out.sort_by(|a, b| a.1.cmp(&b.1));
        out
    }
}

// ── `bun add apk:<name>` ──

/// Packages of a project live in `<install root>/apk`, an Alpine root of its
/// own; commands are exposed through shims that start them with that root's
/// musl loader.
#[derive(Default)]
pub struct Apk;

fn project_settings(ctx: &Ctx<'_>, root: &[u8]) -> Settings {
    let mut repositories: Vec<String> = Vec::new();
    if let Some(list) = ctx.env_var(b"BUN_SYSTEM_APK_REPOSITORIES") {
        repositories.extend(
            strings::tokenize_any(list.as_bytes(), b",\n")
                .map(lossy)
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty()),
        );
    }
    let host_alpine = fs::read(b"/etc/apk/repositories");
    if repositories.is_empty() {
        match &host_alpine {
            Some(text) => {
                for line in strings::split(text, b"\n") {
                    let line = lossy(line);
                    let line = line.trim();
                    if !line.is_empty() && !line.starts_with('#') {
                        repositories.push(line.to_owned());
                    }
                }
            }
            None => repositories.extend(DEFAULT_REPOSITORIES.iter().map(|s| (*s).to_owned())),
        }
    }
    let keys_dir = ctx
        .env_var(b"BUN_SYSTEM_APK_KEYS_DIR")
        .map(String::into_bytes)
        .or_else(|| host_alpine.as_ref().map(|_| b"/etc/apk/keys".to_vec()));
    Settings {
        root: root.to_vec(),
        initdb: true,
        arch: ctx.options.arch.clone(),
        repositories,
        no_system_repositories: true,
        keys_dir,
        allow_untrusted: matches!(ctx.env_var(b"BUN_SYSTEM_APK_ALLOW_UNTRUSTED").as_deref(), Some("1" | "true")),
        no_scripts: !matches!(ctx.env_var(b"BUN_SYSTEM_APK_SCRIPTS").as_deref(), Some("1" | "true")),
        upgrade: false,
        update_cache: ctx.options.refresh,
        force_overwrite: false,
        quiet: !ctx.verbose,
    }
}

fn resolve_root(ctx: &Ctx<'_>) -> Vec<u8> {
    join(&ctx.source_cache_dir(SourceKind::Apk), &[b"resolve-root"])
}

fn parse_range(id: &str, range: &str) -> Result<Dep> {
    let r = range.trim();
    let text = if r.is_empty() || r == "*" || r == "latest" {
        id.to_owned()
    } else if matches!(r.as_bytes()[0], b'<' | b'>' | b'=' | b'~') {
        format!("{id}{r}")
    } else {
        format!("{id}={r}")
    };
    Dep::parse(&text).ok_or_else(|| Error::Parse(format!("invalid apk version range \"{range}\" for {id}")))
}

fn shim_target_dirs() -> [&'static str; 4] {
    ["usr/bin", "bin", "usr/sbin", "sbin"]
}

fn write_shims(root: &InstallRoot, apk_root: &[u8], pkg: &Pkg, arch: &str) -> Result<Vec<String>> {
    let loader = format!("lib/ld-musl-{arch}.so.1");
    let mut out = Vec::new();
    for d in &pkg.dirs {
        if !shim_target_dirs().contains(&d.name.as_str()) {
            continue;
        }
        for f in &d.files {
            let target = join(apk_root, &[d.name.as_bytes(), f.name.as_bytes()]);
            let script = format!(
                "#!/bin/sh\nR='{root}'\nexec \"$R/{loader}\" --library-path \"$R/lib:$R/usr/lib\" '{target}' \"$@\"\n",
                root = lossy(apk_root),
                target = lossy(&target),
            );
            let shim = join(&root.bin_dir, &[f.name.as_bytes()]);
            fs::write(&shim, script.as_bytes())?;
            #[cfg(unix)]
            {
                let z = fs::zpath(&shim);
                // SAFETY: `z` is NUL-terminated.
                unsafe { libc::chmod(z.as_ptr().cast(), 0o755) };
            }
            out.push(lossy(&shim));
        }
    }
    Ok(out)
}

impl Source for Apk {
    fn kind(&self) -> SourceKind {
        SourceKind::Apk
    }

    fn host_can_install(&self, _ctx: &Ctx<'_>) -> bool {
        cfg!(target_os = "linux")
    }

    fn search(&mut self, ctx: &Ctx<'_>, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let mut engine = Engine::open(ctx, project_settings(ctx, &resolve_root(ctx)))?;
        let hits = engine.search(&[query.to_owned()], true)?;
        Ok(hits
            .into_iter()
            .take(limit)
            .map(|p| SearchHit {
                id: p.name.clone(),
                name: p.name,
                version: p.version,
                description: Some(p.description),
            })
            .collect())
    }

    fn info(&mut self, ctx: &Ctx<'_>, id: &str) -> Result<PackageInfo> {
        let mut engine = Engine::open(ctx, project_settings(ctx, &resolve_root(ctx)))?;
        engine.load_indexes()?;
        let mut versions: Vec<&Pkg> = engine.pool.iter().filter(|p| p.name == id).collect();
        if versions.is_empty() {
            return Err(Error::NotFound(format!("apk package \"{id}\"")));
        }
        versions.sort_by(|a, b| version::compare(&b.version, &a.version));
        let top = versions[0];
        Ok(PackageInfo {
            id: id.to_owned(),
            name: top.name.clone(),
            latest: top.version.clone(),
            versions: versions.iter().map(|p| p.version.clone()).collect(),
            publisher: (!top.maintainer.is_empty()).then(|| top.maintainer.clone()),
            description: Some(top.description.clone()),
            homepage: (!top.url.is_empty()).then(|| top.url.clone()),
            license: Some(top.license.clone()),
        })
    }

    fn resolve(&mut self, ctx: &Ctx<'_>, id: &str, range: &str) -> Result<LockEntry> {
        let dep = parse_range(id, range)?;
        let mut engine = Engine::open(ctx, project_settings(ctx, &resolve_root(ctx)))?;
        let order = engine.solve(core::slice::from_ref(&dep)).map_err(|_| Error::NoMatchingVersion {
            id: id.to_owned(),
            range: range.to_owned(),
        })?;
        let chosen = order
            .iter()
            .map(|&i| &engine.pool[i])
            .find(|p| p.name == dep.name || p.provides.iter().any(|v| v.name == dep.name))
            .ok_or_else(|| Error::NotFound(format!("apk package \"{id}\"")))?;
        let mut entry = LockEntry::new(SourceKind::Apk, id);
        entry.version.clone_from(&chosen.version);
        entry.hash = format!("sha1:{}", hex(&chosen.identity));
        if let Some(repo) = chosen.repo.and_then(|r| engine.repos.get(r)) {
            entry.url = repo.package_url(chosen, engine.db.arch());
            entry.meta.insert("repository".to_owned(), repo.url.clone());
        }
        entry.deps = chosen.depends.iter().filter(|d| !d.is_conflict()).map(|d| d.name.clone()).collect();
        entry.meta.insert("arch".to_owned(), engine.db.arch().to_owned());
        entry.meta.insert("name".to_owned(), chosen.name.clone());
        Ok(entry)
    }

    fn install(&mut self, ctx: &Ctx<'_>, entry: &LockEntry, root: &InstallRoot) -> Result<InstalledRecord> {
        let apk_root = join(&root.dir, &[b"apk"]);
        let mut engine = Engine::open(ctx, project_settings(ctx, &apk_root))?;
        let name = entry.meta.get("name").cloned().unwrap_or_else(|| entry.id.clone());
        engine.add(&[format!("{name}={}", entry.version)])?;
        let pkg = engine
            .db
            .installed_by_name(&name)
            .cloned()
            .ok_or_else(|| Error::NotFound(format!("apk package \"{name}\" after install")))?;
        let hash = format!("sha1:{}", hex(&pkg.identity));
        if !entry.hash.is_empty() && entry.hash != hash {
            return Err(Error::Integrity { what: entry.id.clone(), expected: entry.hash.clone(), actual: hash });
        }
        let mut rec = InstalledRecord::new(SourceKind::Apk, &entry.id, &pkg.version, &entry.hash, InstallKind::Files);
        rec.files = pkg.file_paths().iter().map(|p| lossy(&join(&apk_root, &[p.as_bytes()]))).collect();
        rec.bins = write_shims(root, &apk_root, &pkg, engine.db.arch())?;
        rec.meta.insert("name".to_owned(), name);
        Ok(rec)
    }

    fn remove(&mut self, ctx: &Ctx<'_>, record: &InstalledRecord, root: &InstallRoot) -> Result<()> {
        for bin in &record.bins {
            fs::remove_file(bin.as_bytes());
        }
        let apk_root = join(&root.dir, &[b"apk"]);
        let mut engine = Engine::open(ctx, project_settings(ctx, &apk_root))?;
        let name = record.meta.get("name").cloned().unwrap_or_else(|| record.id.clone());
        engine.del(&[name])
    }

    fn compare_versions(&self, a: &str, b: &str) -> core::cmp::Ordering {
        version::compare(a, b)
    }
}
