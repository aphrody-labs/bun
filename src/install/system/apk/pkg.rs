//! Signed `APKINDEX.tar.gz` and v2 `.apk` files: concatenated gzip members
//! (signature, control, data) checked like apk-tools `extract_v2.c`
//! (GPL-2.0-only, aphrody-labs/apk-tools@44dcdfc, apk-tools 3.0.8):
//! - the signature member holds `.SIGN.RSA[256|512].<key name>`; it signs the
//!   digest of the *compressed* bytes that follow (control, plus data when the
//!   control has no `datahash`);
//! - the package identity (`C:Q1…`) is the SHA-1 of the compressed control member;
//! - `datahash` in `.PKGINFO` is the SHA-256 of the compressed data member.

use super::super::rootfs::compress::{self, GzMember};
use super::super::rootfs::crypto::{Alg, PublicKey, digest};
use super::super::rootfs::tar;
use super::super::{Error, Result, lossy};
use super::index::Pkg;
use super::version::Dep;
use bun_core::strings;

/// Trusted signing keys, by file name (`alpine-devel@lists.alpinelinux.org-6165ee59.rsa.pub`).
#[derive(Default)]
pub struct Trust {
    pub keys: Vec<(String, PublicKey)>,
    pub allow_untrusted: bool,
}

impl Trust {
    pub fn load(dirs: &[Vec<u8>], allow_untrusted: bool) -> Trust {
        let mut keys = Vec::new();
        for dir in dirs {
            for name in super::super::rootfs::list_dir(dir) {
                let path = super::super::join(dir, &[&name]);
                let Some(bytes) = super::super::fs::read(&path) else {
                    continue;
                };
                if let Some(key) = PublicKey::from_pem_or_der(&bytes) {
                    keys.push((lossy(&name), key));
                }
            }
        }
        Trust { keys, allow_untrusted }
    }

    fn key(&self, name: &[u8]) -> Option<&PublicKey> {
        self.keys.iter().find(|(n, _)| n.as_bytes() == name).map(|(_, k)| k)
    }
}

struct Signature<'t> {
    alg: Alg,
    key: &'t PublicKey,
    sig: Vec<u8>,
}

/// Index of the first non-signature member and the trusted signature found in it.
fn split_signature<'t>(members: &[GzMember], trust: &'t Trust) -> Result<(usize, Option<Signature<'t>>, bool)> {
    let first = members.first().ok_or_else(|| Error::Parse("empty archive".to_owned()))?;
    let entries = tar::entries(&first.data)?;
    let is_sig = !entries.is_empty() && entries.iter().all(|e| e.path.starts_with(b".SIGN."));
    if !is_sig {
        return Ok((0, None, false));
    }
    let mut found = None;
    for e in &entries {
        let rest = &e.path[6..];
        let (alg, name) = if let Some(n) = rest.strip_prefix(b"RSA512.") {
            (Alg::Sha512, n)
        } else if let Some(n) = rest.strip_prefix(b"RSA256.") {
            (Alg::Sha256, n)
        } else if let Some(n) = rest.strip_prefix(b"RSA.") {
            (Alg::Sha1, n)
        } else {
            continue;
        };
        if e.data.len() > 65536 {
            continue;
        }
        if let Some(key) = trust.key(name) {
            found = Some(Signature { alg, key, sig: e.data.to_vec() });
            break;
        }
    }
    Ok((1, found, true))
}

fn verify_signature(sig: Option<&Signature<'_>>, signed: &[u8], trust: &Trust, what: &str) -> Result<()> {
    match sig {
        Some(s) => {
            if s.key.verify_digest(s.alg, &digest(s.alg, signed), &s.sig) {
                Ok(())
            } else {
                Err(Error::Integrity {
                    what: what.to_owned(),
                    expected: "a valid signature".to_owned(),
                    actual: "BAD signature".to_owned(),
                })
            }
        }
        None if trust.allow_untrusted => Ok(()),
        None => Err(Error::Integrity {
            what: what.to_owned(),
            expected: "a signature by a trusted key (--keys-dir, /etc/apk/keys)".to_owned(),
            actual: "UNTRUSTED signature".to_owned(),
        }),
    }
}

pub struct Index {
    pub description: String,
    pub packages: Vec<Pkg>,
}

/// Verifies and parses `APKINDEX.tar.gz`.
pub fn read_index(bytes: &[u8], trust: &Trust, repo: usize, what: &str) -> Result<Index> {
    let members = compress::gunzip_members(bytes, what)?;
    let (start, sig, _) = split_signature(&members, trust)?;
    let body_start = members.get(start).map_or(bytes.len(), |m| m.start);
    let body_end = members.last().map_or(bytes.len(), |m| m.end);
    verify_signature(sig.as_ref(), &bytes[body_start..body_end], trust, what)?;
    let mut tarball = Vec::new();
    for m in &members[start..] {
        tarball.extend_from_slice(&m.data);
    }
    let mut description = String::new();
    let mut packages = None;
    for e in tar::entries(&tarball)? {
        match e.path.as_slice() {
            b"DESCRIPTION" => description = lossy(e.data).trim().to_owned(),
            b"APKINDEX" => packages = Some(super::index::parse(e.data, Some(repo))),
            _ => {}
        }
    }
    let packages = packages.ok_or_else(|| Error::Parse(format!("{what}: no APKINDEX inside")))?;
    Ok(Index { description, packages })
}

pub const SCRIPT_TYPES: [&str; 7] = [
    "pre-install",
    "post-install",
    "pre-deinstall",
    "post-deinstall",
    "pre-upgrade",
    "post-upgrade",
    "trigger",
];

/// A verified v2 package.
pub struct ApkFile {
    pub info: Pkg,
    pub scripts: Vec<(&'static str, Vec<u8>)>,
    pub triggers: Vec<String>,
    /// Decompressed data tar.
    pub data: Vec<u8>,
}

impl ApkFile {
    pub fn script(&self, kind: &str) -> Option<&[u8]> {
        self.scripts.iter().find(|(k, _)| *k == kind).map(|(_, s)| s.as_slice())
    }
}

/// Reads a v2 `.apk`. With `identity` (from a verified index) the control
/// digest must match it; otherwise the embedded signature must be trusted.
pub fn read_package(bytes: &[u8], identity: Option<&[u8]>, trust: &Trust, what: &str) -> Result<ApkFile> {
    let members = compress::gunzip_members(bytes, what)?;
    let (control_ix, sig, _) = split_signature(&members, trust)?;
    let control = members
        .get(control_ix)
        .ok_or_else(|| Error::Parse(format!("{what}: missing control section")))?;
    let control_bytes = &bytes[control.start..control.end];
    let mut info = Pkg::default();
    let mut scripts = Vec::new();
    let mut triggers = Vec::new();
    let mut datahash: Option<Vec<u8>> = None;
    for e in tar::entries(&control.data)? {
        let path = e.path.as_slice();
        if path == b".PKGINFO" {
            parse_pkginfo(e.data, &mut info, &mut triggers, &mut datahash);
        } else if let Some(kind) = path.strip_prefix(b".") {
            if let Some(t) = SCRIPT_TYPES.iter().find(|t| t.as_bytes() == kind) {
                scripts.push((*t, e.data.to_vec()));
            } else if kind == b"INSTALL" {
                return Err(Error::Parse(format!("{what}: .INSTALL scripts are not supported by apk v2")));
            }
        }
    }
    if info.name.is_empty() {
        return Err(Error::Parse(format!("{what}: no .PKGINFO")));
    }
    let data_start = members.get(control_ix + 1).map_or(control.end, |m| m.start);
    let data_end = members.last().map_or(control.end, |m| m.end);
    let data_bytes = &bytes[data_start..data_end];

    let sha1 = digest(Alg::Sha1, control_bytes);
    match identity {
        Some(id) if id.len() == 20 => {
            if id != sha1.as_slice() {
                return Err(Error::Integrity {
                    what: what.to_owned(),
                    expected: super::index::encode_digest(id),
                    actual: super::index::encode_digest(&sha1),
                });
            }
        }
        Some(id) if id.len() == 32 => {
            let sha256 = digest(Alg::Sha256, control_bytes);
            if id != sha256.as_slice() {
                return Err(Error::Integrity {
                    what: what.to_owned(),
                    expected: super::index::encode_digest(id),
                    actual: super::index::encode_digest(&sha256),
                });
            }
        }
        _ => {
            let signed_end = if datahash.is_some() { control.end } else { data_end };
            verify_signature(sig.as_ref(), &bytes[control.start..signed_end], trust, what)?;
        }
    }
    if let Some(expected) = &datahash {
        let actual = digest(Alg::Sha256, data_bytes);
        if &actual != expected {
            return Err(Error::Integrity {
                what: format!("{what} (data section)"),
                expected: super::super::hex(expected),
                actual: super::super::hex(&actual),
            });
        }
    }
    info.identity = sha1;
    info.size = bytes.len() as u64;
    let mut data = Vec::new();
    for m in &members[(control_ix + 1).min(members.len())..] {
        data.extend_from_slice(&m.data);
    }
    Ok(ApkFile { info, scripts, triggers, data })
}

fn parse_pkginfo(text: &[u8], info: &mut Pkg, triggers: &mut Vec<String>, datahash: &mut Option<Vec<u8>>) {
    for line in strings::split(text, b"\n") {
        if line.first() == Some(&b'#') {
            continue;
        }
        let Some((k, v)) = strings::split_once(line, b" = ") else {
            continue;
        };
        let s = lossy(v);
        match k {
            b"pkgname" => info.name = s,
            b"pkgver" => info.version = s,
            b"pkgdesc" => info.description = s,
            b"url" => info.url = s,
            b"builddate" => info.build_time = s.parse().unwrap_or(0),
            b"size" => info.installed_size = s.parse().unwrap_or(0),
            b"arch" => info.arch = s,
            b"origin" => info.origin = s,
            b"commit" => info.commit = s,
            b"maintainer" => info.maintainer = s,
            b"license" => info.license = s,
            b"depend" => info.depends.extend(Dep::parse_list(&s)),
            b"provides" => info.provides.extend(Dep::parse_list(&s)),
            b"install_if" => info.install_if.extend(Dep::parse_list(&s)),
            b"replaces" => info.replaces.extend(Dep::parse_list(&s)),
            b"replaces_priority" => info.replaces_priority = s.parse().unwrap_or(0),
            b"provider_priority" => info.provider_priority = s.parse().unwrap_or(0),
            b"triggers" => triggers.extend(s.split_whitespace().map(str::to_owned)),
            b"datahash" => *datahash = super::super::rootfs::crypto::hex_decode(v),
            _ => {}
        }
    }
}
