//! The apk database of a root: `etc/apk/{world,arch,repositories,keys}` and
//! `lib/apk/db/{installed,triggers,scripts.tar[.gz]}`, read and written in the
//! layout of apk-tools `database.c` (GPL-2.0-only, aphrody-labs/apk-tools@44dcdfc,
//! apk-tools 3.0.8) so the real `apk` can manage a root built by Bun.

use std::collections::HashMap;

use super::super::rootfs::compress;
use super::super::rootfs::fsops::Root;
use super::super::rootfs::tar::{self, Kind};
use super::super::{Result, hex, lossy};
use super::index::{self, Pkg};
use super::pkg::SCRIPT_TYPES;
use super::version::Dep;
use bun_core::strings;

pub const WORLD: &[u8] = b"etc/apk/world";
pub const ARCH: &[u8] = b"etc/apk/arch";
pub const REPOSITORIES: &[u8] = b"etc/apk/repositories";
pub const INSTALLED: &[u8] = b"lib/apk/db/installed";
pub const TRIGGERS: &[u8] = b"lib/apk/db/triggers";
pub const SCRIPTS_TAR: &[u8] = b"lib/apk/db/scripts.tar";
pub const SCRIPTS_TAR_GZ: &[u8] = b"lib/apk/db/scripts.tar.gz";
pub const LOCK: &[u8] = b"lib/apk/db/lock";

/// One `etc/apk/repositories` line, expanded.
#[derive(Clone, Debug)]
pub struct Repo {
    /// As written (`https://dl-cdn.alpinelinux.org/alpine/v3.24/main`).
    pub url: String,
    pub tag: Option<String>,
    /// `APKINDEX.tar.gz` location.
    pub index_url: String,
    /// `None` for `<base>/<arch>/<name>-<version>.apk`, `Some(dir)` for a flat
    /// index URL (`…/APKINDEX.tar.gz`) whose packages sit next to it.
    pub flat_base: Option<String>,
}

/// A repository URL: `scheme://…`, an absolute path, or a Windows drive path.
fn is_url(word: &str) -> bool {
    let b = word.as_bytes();
    b.first() == Some(&b'/')
        || strings::index_of(b, b"://").is_some()
        || (b.len() > 2 && b[1] == b':' && matches!(b[2], b'/' | b'\\') && b[0].is_ascii_alphabetic())
}

impl Repo {
    /// `apk_repoparser_parse` for one line; `None` for comments, `set`, v3/`.adb` lines.
    pub fn parse_line(line: &str, arch: &str) -> Option<Repo> {
        let mut words = strings::tokenize_any(line.as_bytes(), b" \t").map(lossy);
        let mut word = words.next()?;
        if word.starts_with('#') {
            return None;
        }
        let mut v3 = false;
        if !word.starts_with('@') && !is_url(&word) {
            match word.as_str() {
                "v2" | "ndx" => {}
                "v3" => v3 = true,
                _ => return None,
            }
            word = words.next()?;
        }
        let mut tag = None;
        if let Some(t) = word.strip_prefix('@') {
            tag = Some(t.to_owned());
            word = words.next()?;
        }
        let url = word.trim_end_matches('/').to_owned();
        if v3 || url.ends_with(".adb") {
            return None;
        }
        let components: Vec<String> = words.collect();
        let base = if components.is_empty() {
            url.clone()
        } else {
            // `url comp1 comp2` expands to one repository per component; the
            // caller only keeps the first, the others come from `expand`.
            format!("{url}/{}", components[0])
        };
        Some(Repo::from_base(&base, tag, arch))
    }

    fn from_base(base: &str, tag: Option<String>, arch: &str) -> Repo {
        if base.ends_with(".tar.gz") {
            let dir = match strings::last_index_of_char(base.as_bytes(), b'/') {
                Some(i) => base[..i].to_owned(),
                None => ".".to_owned(),
            };
            return Repo { url: base.to_owned(), tag, index_url: base.to_owned(), flat_base: Some(dir) };
        }
        Repo {
            url: base.to_owned(),
            tag,
            index_url: format!("{base}/{arch}/APKINDEX.tar.gz"),
            flat_base: None,
        }
    }

    /// Every repository of one line (`url main community` is two).
    pub fn expand(line: &str, arch: &str) -> Vec<Repo> {
        let Some(first) = Repo::parse_line(line, arch) else {
            return Vec::new();
        };
        let words: Vec<String> = strings::tokenize_any(line.as_bytes(), b" \t").map(lossy).collect();
        let url_at = words.iter().position(|w| is_url(w));
        let Some(url_at) = url_at else {
            return vec![first];
        };
        let comps = &words[url_at + 1..];
        if comps.is_empty() {
            return vec![first];
        }
        let url = words[url_at].trim_end_matches('/');
        comps.iter().map(|c| Repo::from_base(&format!("{url}/{c}"), first.tag.clone(), arch)).collect()
    }

    /// Download URL of `pkg` (`${arch}/${name}-${version}.apk`).
    pub fn package_url(&self, pkg: &Pkg, default_arch: &str) -> String {
        match &self.flat_base {
            Some(dir) => format!("{dir}/{}", pkg.file_name()),
            None => {
                let arch = if pkg.arch.is_empty() { default_arch } else { pkg.arch.as_str() };
                format!("{}/{arch}/{}", self.url, pkg.file_name())
            }
        }
    }
}

pub struct Db {
    pub root: Root,
    pub installed: Vec<Pkg>,
    pub world: Vec<Dep>,
    /// Scripts of installed packages, by package identity.
    pub scripts: HashMap<Vec<u8>, Vec<(&'static str, Vec<u8>)>>,
    /// Trigger patterns of installed packages, by package identity.
    pub triggers: HashMap<Vec<u8>, Vec<String>>,
    pub arches: Vec<String>,
    write_arch: bool,
    scripts_plain_tar: bool,
}

impl Db {
    pub fn is_initialized(root: &Root) -> bool {
        root.exists(b"lib/apk/db")
    }

    /// Opens the database of `root`. With `create` (`--initdb`) a missing
    /// database starts empty; `arch` overrides `etc/apk/arch`.
    pub fn open(root: &Root, create: bool, arch: Option<&str>) -> Result<Db> {
        if !create && !Db::is_initialized(root) {
            return Err(super::super::Error::NotFound(format!(
                "apk database in {} (use --initdb to create one)",
                lossy(&root.dir)
            )));
        }
        let mut arches: Vec<String> = Vec::new();
        let mut write_arch = false;
        if let Some(a) = arch {
            arches.push(a.to_owned());
            write_arch = true;
        } else if let Some(text) = root.read(ARCH) {
            for w in strings::tokenize_any(&text, b" \t\r\n") {
                let w = lossy(w);
                if !arches.contains(&w) {
                    arches.push(w);
                }
            }
        }
        if arches.is_empty() {
            arches.push(super::super::rootfs::host_arch(super::super::rootfs::ArchStyle::Apk).to_owned());
            write_arch = true;
        }
        let world = root.read(WORLD).map(|t| Dep::parse_list(&lossy(&t))).unwrap_or_default();
        let installed = root.read(INSTALLED).map(|t| index::parse(&t, None)).unwrap_or_default();
        let by_identity: HashMap<Vec<u8>, ()> = installed.iter().map(|p| (p.identity.clone(), ())).collect();

        let mut triggers = HashMap::new();
        if let Some(text) = root.read(TRIGGERS) {
            for line in strings::split(&text, b"\n") {
                let mut words = strings::tokenize_any(line, b" \t\r");
                let Some(id) = words.next().and_then(index::decode_digest) else {
                    continue;
                };
                if by_identity.contains_key(&id) {
                    triggers.insert(id, words.map(lossy).collect::<Vec<_>>());
                }
            }
        }

        let mut scripts: HashMap<Vec<u8>, Vec<(&'static str, Vec<u8>)>> = HashMap::new();
        let (tarball, scripts_plain_tar) = match root.read(SCRIPTS_TAR) {
            Some(t) => (Some(t), true),
            None => (root.read(SCRIPTS_TAR_GZ).and_then(|gz| compress::gunzip(&gz, "scripts.tar.gz").ok()), false),
        };
        if let Some(tarball) = tarball {
            for e in tar::entries(&tarball)? {
                if e.kind != Kind::File {
                    continue;
                }
                // `<name>-<version>.X1<hex sha1>.<action>`
                let Some(dot) = strings::last_index_of_char(&e.path, b'.') else {
                    continue;
                };
                let action = &e.path[dot + 1..];
                let Some(kind) = SCRIPT_TYPES.iter().find(|t| t.as_bytes() == action) else {
                    continue;
                };
                let Some(dot2) = strings::last_index_of_char(&e.path[..dot], b'.') else {
                    continue;
                };
                let Some(id) = e.path[dot2 + 1..dot]
                    .strip_prefix(b"X1")
                    .and_then(super::super::rootfs::crypto::hex_decode)
                else {
                    continue;
                };
                if by_identity.contains_key(&id) {
                    scripts.entry(id).or_default().push((*kind, e.data.to_vec()));
                }
            }
        }

        Ok(Db {
            root: root.clone(),
            installed,
            world,
            scripts,
            triggers,
            arches,
            write_arch,
            scripts_plain_tar,
        })
    }

    pub fn arch(&self) -> &str {
        &self.arches[0]
    }

    pub fn installed_by_name(&self, name: &str) -> Option<&Pkg> {
        self.installed.iter().find(|p| p.name == name)
    }

    /// `etc/apk/repositories`, then `etc/apk/repositories.d/*.list` and
    /// `lib/apk/repositories.d/*.list`.
    pub fn repositories(&self) -> Vec<Repo> {
        let mut files: Vec<Vec<u8>> = vec![REPOSITORIES.to_vec()];
        for dir in [&b"etc/apk/repositories.d"[..], b"lib/apk/repositories.d"] {
            for name in super::super::rootfs::list_dir(&self.root.resolved_host(dir)) {
                if name.ends_with(b".list") && name.first() != Some(&b'.') {
                    let mut rel = dir.to_vec();
                    rel.push(b'/');
                    rel.extend_from_slice(&name);
                    files.push(rel);
                }
            }
        }
        let mut out = Vec::new();
        for f in files {
            if let Some(text) = self.root.read(&f) {
                for line in strings::split(&text, b"\n") {
                    let line = lossy(line);
                    out.extend(Repo::expand(line.trim(), self.arch()));
                }
            }
        }
        out
    }

    /// Host directories holding trusted keys (`etc/apk/keys`, `lib/apk/keys`).
    pub fn key_dirs(&self) -> Vec<Vec<u8>> {
        vec![self.root.resolved_host(b"etc/apk/keys"), self.root.resolved_host(b"lib/apk/keys")]
    }

    /// `apk_db_write_config`: arch, world, installed, triggers and scripts.
    pub fn write(&mut self) -> Result<()> {
        self.root.mkdirs(b"lib/apk/db", 0o755)?;
        self.root.mkdirs(b"etc/apk", 0o755)?;
        if self.write_arch {
            let mut text = self.arches.join("\n");
            text.push('\n');
            self.root.write_atomic(ARCH, text.as_bytes(), 0o644)?;
        }
        let mut world = self.world.iter().map(ToString::to_string).collect::<Vec<_>>();
        world.sort();
        world.dedup();
        let mut text = world.join("\n");
        text.push('\n');
        self.root.write_atomic(WORLD, text.as_bytes(), 0o644)?;

        self.installed.sort_by(|a, b| a.name.cmp(&b.name));
        let mut installed = String::new();
        let mut triggers = String::new();
        let mut scripts = Vec::new();
        for p in &self.installed {
            index::write_installed(p, &mut installed);
            if let Some(list) = self.triggers.get(&p.identity) {
                if !list.is_empty() {
                    triggers.push_str(&index::encode_digest(&p.identity));
                    for t in list {
                        triggers.push(' ');
                        triggers.push_str(t);
                    }
                    triggers.push('\n');
                }
            }
            if let Some(list) = self.scripts.get(&p.identity) {
                for kind in SCRIPT_TYPES {
                    let Some((_, body)) = list.iter().find(|(k, _)| *k == kind) else {
                        continue;
                    };
                    let name = format!("{}-{}.X1{}.{kind}", p.name, p.version, hex(&p.identity));
                    tar::write_entry(
                        &mut scripts,
                        name.as_bytes(),
                        Kind::File,
                        0o755,
                        i64::try_from(p.build_time).unwrap_or(0),
                        body,
                    );
                }
            }
        }
        tar::write_end(&mut scripts);
        self.root.write_atomic(INSTALLED, installed.as_bytes(), 0o644)?;
        self.root.write_atomic(TRIGGERS, triggers.as_bytes(), 0o644)?;
        if self.scripts_plain_tar {
            self.root.write_atomic(SCRIPTS_TAR, &scripts, 0o644)?;
        } else {
            self.root.write_atomic(SCRIPTS_TAR_GZ, &compress::gzip(&scripts), 0o644)?;
        }
        if !self.root.exists(LOCK) {
            self.root.write_atomic(LOCK, b"", 0o600)?;
        }
        Ok(())
    }
}
