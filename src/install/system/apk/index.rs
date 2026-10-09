//! `APKINDEX` and `lib/apk/db/installed` text records.
//!
//! Field layout ported from apk-tools `apk_pkg_write_index_header`,
//! `apk_db_fdb_read` and `apk_db_fdb_write` (GPL-2.0-only,
//! aphrody-labs/apk-tools@44dcdfc, apk-tools 3.0.8). Pure: no I/O.

use super::version::Dep;
use bun_core::strings;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Acl {
    pub uid: u32,
    pub gid: u32,
    pub mode: u32,
    /// Digest of the xattrs, when any.
    pub xattr_digest: Option<Vec<u8>>,
}

#[derive(Clone, Debug, Default)]
pub struct FileRec {
    pub name: String,
    pub acl: Option<Acl>,
    pub digest: Option<Vec<u8>>,
}

#[derive(Clone, Debug, Default)]
pub struct DirRec {
    /// Root-relative, no leading `/` (`usr/bin`).
    pub name: String,
    pub acl: Option<Acl>,
    pub files: Vec<FileRec>,
}

#[derive(Clone, Debug, Default)]
pub struct Pkg {
    pub name: String,
    pub version: String,
    pub arch: String,
    pub size: u64,
    pub installed_size: u64,
    pub description: String,
    pub url: String,
    pub license: String,
    pub origin: String,
    pub maintainer: String,
    pub build_time: u64,
    pub commit: String,
    pub provider_priority: u32,
    /// Raw control digest (`C:Q1…` is its SHA-1).
    pub identity: Vec<u8>,
    pub depends: Vec<Dep>,
    pub provides: Vec<Dep>,
    pub install_if: Vec<Dep>,
    /// Index of the repository this record came from; `None` for installed-only.
    pub repo: Option<usize>,
    // ── installed database only ──
    pub tags: Vec<String>,
    pub replaces: Vec<Dep>,
    pub replaces_priority: u32,
    pub repo_tag: String,
    pub broken: String,
    pub dirs: Vec<DirRec>,
}

impl Pkg {
    pub fn name_version(&self) -> String {
        format!("{}-{}", self.name, self.version)
    }

    /// `<name>-<version>.apk`, the file name inside a repository.
    pub fn file_name(&self) -> String {
        format!("{}-{}.apk", self.name, self.version)
    }

    /// Every file path (root-relative) this package owns.
    pub fn file_paths(&self) -> Vec<String> {
        let mut out = Vec::new();
        for d in &self.dirs {
            for f in &d.files {
                out.push(if d.name.is_empty() { f.name.clone() } else { format!("{}/{}", d.name, f.name) });
            }
        }
        out
    }
}

// ── digests as written by apk (`Q1` + base64 of SHA-1, `Q2` + base64 of SHA-256) ──

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn base64_decode(text: &[u8]) -> Option<Vec<u8>> {
    let val = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    };
    let text: Vec<u8> = text.iter().copied().filter(|c| !c.is_ascii_whitespace()).collect();
    if text.len() % 4 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    for q in text.chunks(4) {
        let pad = q.iter().rev().take_while(|&&c| c == b'=').count();
        if pad > 2 {
            return None;
        }
        let mut n = 0u32;
        for (i, &c) in q.iter().enumerate() {
            n <<= 6;
            if i < 4 - pad {
                n |= val(c)?;
            }
        }
        out.push((n >> 16) as u8);
        if pad < 2 {
            out.push((n >> 8) as u8);
        }
        if pad < 1 {
            out.push(n as u8);
        }
    }
    Some(out)
}

pub fn encode_digest(d: &[u8]) -> String {
    match d.len() {
        20 => format!("Q1{}", base64_encode(d)),
        32 => format!("Q2{}", base64_encode(d)),
        _ => String::new(),
    }
}

pub fn decode_digest(text: &[u8]) -> Option<Vec<u8>> {
    if let Some(b) = text.strip_prefix(b"Q1") {
        return base64_decode(b).filter(|d| d.len() == 20);
    }
    if let Some(b) = text.strip_prefix(b"Q2") {
        return base64_decode(b).filter(|d| d.len() == 32);
    }
    if text.len() == 40 {
        let mut out = Vec::with_capacity(20);
        for p in text.chunks(2) {
            let s = core::str::from_utf8(p).ok()?;
            out.push(u8::from_str_radix(s, 16).ok()?);
        }
        return Some(out);
    }
    None
}

fn text(v: &[u8]) -> String {
    super::super::lossy(v)
}

fn num(v: &[u8]) -> u64 {
    super::super::rootfs::parse_u64(v).unwrap_or(0)
}

fn parse_acl(v: &[u8]) -> Option<Acl> {
    let mut it = strings::split(v, b":");
    let uid = super::super::rootfs::parse_u32(it.next()?)?;
    let gid = super::super::rootfs::parse_u32(it.next()?)?;
    let mode = u32::from_str_radix(core::str::from_utf8(it.next()?).ok()?, 8).ok()?;
    let xattr_digest = it.next().and_then(decode_digest);
    Some(Acl { uid, gid, mode, xattr_digest })
}

/// Parses an `APKINDEX` or `installed` database. `repo` is stored on every record.
pub fn parse(data: &[u8], repo: Option<usize>) -> Vec<Pkg> {
    let mut out = Vec::new();
    let mut cur = Pkg { repo, ..Pkg::default() };
    let mut started = false;
    let flush = |cur: &mut Pkg, started: &mut bool, out: &mut Vec<Pkg>| {
        if *started && !cur.name.is_empty() {
            out.push(core::mem::replace(cur, Pkg { repo, ..Pkg::default() }));
        } else {
            *cur = Pkg { repo, ..Pkg::default() };
        }
        *started = false;
    };
    for line in strings::split(data, b"\n") {
        let line = line.strip_suffix(b"\r").unwrap_or(line);
        if line.is_empty() {
            flush(&mut cur, &mut started, &mut out);
            continue;
        }
        if line.len() < 2 || line[1] != b':' {
            continue;
        }
        started = true;
        let v = &line[2..];
        match line[0] {
            b'C' => cur.identity = decode_digest(v).unwrap_or_default(),
            b'P' => cur.name = text(v),
            b'V' => cur.version = text(v),
            b'A' => cur.arch = text(v),
            b'S' => cur.size = num(v),
            b'I' => cur.installed_size = num(v),
            b'T' => cur.description = text(v),
            b'U' => cur.url = text(v),
            b'L' => cur.license = text(v),
            b'o' => cur.origin = text(v),
            b'm' => cur.maintainer = text(v),
            b't' => cur.build_time = num(v),
            b'c' => cur.commit = text(v),
            b'k' => cur.provider_priority = num(v) as u32,
            b'D' => cur.depends.extend(Dep::parse_list(&text(v))),
            b'p' => cur.provides.extend(Dep::parse_list(&text(v))),
            b'i' => cur.install_if.extend(Dep::parse_list(&text(v))),
            b'r' => cur.replaces.extend(Dep::parse_list(&text(v))),
            b'q' => cur.replaces_priority = num(v) as u32,
            b's' => cur.repo_tag = text(v),
            b'f' => cur.broken = text(v),
            b'g' => cur.tags.extend(strings::tokenize_any(v, b" ").map(text)),
            b'F' => cur.dirs.push(DirRec { name: text(v), acl: None, files: Vec::new() }),
            b'M' => {
                if let Some(d) = cur.dirs.last_mut() {
                    d.acl = parse_acl(v);
                }
            }
            b'R' => {
                if cur.dirs.is_empty() {
                    cur.dirs.push(DirRec::default());
                }
                if let Some(d) = cur.dirs.last_mut() {
                    d.files.push(FileRec { name: text(v), acl: None, digest: None });
                }
            }
            b'a' => {
                if let Some(f) = cur.dirs.last_mut().and_then(|d| d.files.last_mut()) {
                    f.acl = parse_acl(v);
                }
            }
            b'Z' => {
                if let Some(f) = cur.dirs.last_mut().and_then(|d| d.files.last_mut()) {
                    f.digest = decode_digest(v);
                }
            }
            _ => {}
        }
    }
    flush(&mut cur, &mut started, &mut out);
    out
}

fn push_deps(out: &mut String, field: &str, deps: &[Dep]) {
    if deps.is_empty() {
        return;
    }
    out.push_str(field);
    out.push_str(&super::version::format_list(deps));
    out.push('\n');
}

/// `apk_pkg_write_index_header`.
pub fn write_header(p: &Pkg, out: &mut String) {
    use core::fmt::Write as _;
    let _ = write!(out, "C:{}\nP:{}\nV:{}\n", encode_digest(&p.identity), p.name, p.version);
    if !p.arch.is_empty() {
        let _ = writeln!(out, "A:{}", p.arch);
    }
    let _ = write!(
        out,
        "S:{}\nI:{}\nT:{}\nU:{}\nL:{}\n",
        p.size, p.installed_size, p.description, p.url, p.license
    );
    if !p.origin.is_empty() {
        let _ = writeln!(out, "o:{}", p.origin);
    }
    if !p.maintainer.is_empty() {
        let _ = writeln!(out, "m:{}", p.maintainer);
    }
    if p.build_time != 0 {
        let _ = writeln!(out, "t:{}", p.build_time);
    }
    if !p.commit.is_empty() {
        let _ = writeln!(out, "c:{}", p.commit);
    }
    if p.provider_priority != 0 {
        let _ = writeln!(out, "k:{}", p.provider_priority);
    }
    push_deps(out, "D:", &p.depends);
    push_deps(out, "p:", &p.provides);
    push_deps(out, "i:", &p.install_if);
}

fn push_acl(out: &mut String, field: char, acl: &Acl) {
    use core::fmt::Write as _;
    let _ = write!(out, "{field}:{}:{}:{:o}", acl.uid, acl.gid, acl.mode);
    if let Some(d) = &acl.xattr_digest {
        let _ = write!(out, ":{}", encode_digest(d));
    }
    out.push('\n');
}

/// One `installed` record (`apk_db_fdb_write`).
pub fn write_installed(p: &Pkg, out: &mut String) {
    use core::fmt::Write as _;
    write_header(p, out);
    for t in &p.tags {
        let _ = writeln!(out, "g:{t}");
    }
    push_deps(out, "r:", &p.replaces);
    if p.replaces_priority != 0 {
        let _ = writeln!(out, "q:{}", p.replaces_priority);
    }
    if !p.repo_tag.is_empty() {
        let _ = writeln!(out, "s:{}", p.repo_tag);
    }
    if !p.broken.is_empty() {
        let _ = writeln!(out, "f:{}", p.broken);
    }
    let default_dir = Acl { uid: 0, gid: 0, mode: 0o755, xattr_digest: None };
    let default_file = Acl { uid: 0, gid: 0, mode: 0o644, xattr_digest: None };
    for d in &p.dirs {
        let _ = writeln!(out, "F:{}", d.name);
        if let Some(acl) = &d.acl {
            if *acl != default_dir {
                push_acl(out, 'M', acl);
            }
        }
        for f in &d.files {
            let _ = writeln!(out, "R:{}", f.name);
            if let Some(acl) = &f.acl {
                if *acl != default_file {
                    push_acl(out, 'a', acl);
                }
            }
            if let Some(z) = &f.digest {
                let _ = writeln!(out, "Z:{}", encode_digest(z));
            }
        }
    }
    out.push('\n');
}
