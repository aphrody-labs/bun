//! Shared engine for the distribution package sources (apk, deb, pacman):
//! archive formats, signatures, a chroot-safe view of a root filesystem and
//! the maintainer-script runner.

pub mod compress;
pub mod crypto;
pub mod fsops;
pub mod scripts;
pub mod tar;

use bun_core::strings;

/// Names of the entries of `dir` (no `.`/`..`); empty when it cannot be read.
pub fn list_dir(dir: &[u8]) -> Vec<Vec<u8>> {
    let mut out = Vec::new();
    let Ok(fd) = bun_sys::open_dir_absolute(dir) else {
        return out;
    };
    let mut iter = bun_sys::iterate_dir(fd);
    while let Ok(Some(entry)) = iter.next() {
        let name = entry.name.slice_u8();
        if name != b"." && name != b".." {
            out.push(name.to_vec());
        }
    }
    let _ = bun_sys::close(fd);
    out.sort();
    out
}

/// `true` when running as uid 0 (ownership, device nodes and chroot are allowed).
pub fn is_superuser() -> bool {
    #[cfg(unix)]
    {
        // SAFETY: geteuid has no preconditions.
        unsafe { libc::geteuid() == 0 }
    }
    #[cfg(not(unix))]
    {
        false
    }
}

/// Host CPU in the spelling of each distribution.
pub fn host_arch(style: ArchStyle) -> &'static str {
    let (x64, arm64, x86, arm) = match style {
        ArchStyle::Apk => ("x86_64", "aarch64", "x86", "armv7"),
        ArchStyle::Deb => ("amd64", "arm64", "i386", "armhf"),
        ArchStyle::Pacman => ("x86_64", "aarch64", "i686", "armv7h"),
    };
    if cfg!(target_arch = "x86_64") {
        x64
    } else if cfg!(target_arch = "aarch64") {
        arm64
    } else if cfg!(target_arch = "x86") {
        x86
    } else {
        arm
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ArchStyle {
    Apk,
    Deb,
    Pacman,
}

/// Normalizes a user-supplied architecture (`x64`, `amd64`, `arm64`, …) to `style`.
pub fn normalize_arch(style: ArchStyle, arch: &str) -> String {
    let canonical = match arch {
        "x64" | "x86_64" | "amd64" => 0,
        "arm64" | "aarch64" => 1,
        "x86" | "i386" | "i686" => 2,
        "arm" | "armv7" | "armhf" | "armv7h" => 3,
        other => return other.to_owned(),
    };
    let names: [&str; 4] = match style {
        ArchStyle::Apk => ["x86_64", "aarch64", "x86", "armv7"],
        ArchStyle::Deb => ["amd64", "arm64", "i386", "armhf"],
        ArchStyle::Pacman => ["x86_64", "aarch64", "i686", "armv7h"],
    };
    names[canonical].to_owned()
}

/// User and group names of a root filesystem (`etc/passwd`, `etc/group`), so
/// archive owners resolve to the ids of the target system, not the host.
#[derive(Default)]
pub struct IdCache {
    users: Vec<(Vec<u8>, u32)>,
    groups: Vec<(Vec<u8>, u32)>,
}

impl IdCache {
    pub fn load(root: &fsops::Root) -> IdCache {
        let parse = |rel: &[u8]| -> Vec<(Vec<u8>, u32)> {
            let Some(text) = root.read(rel) else {
                return Vec::new();
            };
            let mut out = Vec::new();
            for line in strings::split(&text, b"\n") {
                let mut fields = strings::split(line, b":");
                let (Some(name), Some(_), Some(id)) = (fields.next(), fields.next(), fields.next()) else {
                    continue;
                };
                if let Some(id) = parse_u32(id) {
                    out.push((name.to_vec(), id));
                }
            }
            out
        };
        IdCache { users: parse(b"etc/passwd"), groups: parse(b"etc/group") }
    }

    /// `(uid, gid)` for a tar entry: names first, numeric ids as fallback.
    pub fn resolve(&self, uname: &[u8], gname: &[u8], uid: u32, gid: u32) -> (u32, u32) {
        let find = |list: &[(Vec<u8>, u32)], name: &[u8], fallback: u32| {
            if name.is_empty() {
                return fallback;
            }
            if name == b"root" {
                return 0;
            }
            list.iter().find(|(n, _)| n.as_slice() == name).map_or(fallback, |(_, id)| *id)
        };
        (find(&self.users, uname, uid), find(&self.groups, gname, gid))
    }
}

pub fn parse_u32(bytes: &[u8]) -> Option<u32> {
    if bytes.is_empty() || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let mut v: u32 = 0;
    for &b in bytes {
        v = v.checked_mul(10)?.checked_add(u32::from(b - b'0'))?;
    }
    Some(v)
}

pub fn parse_u64(bytes: &[u8]) -> Option<u64> {
    if bytes.is_empty() || !bytes.iter().all(u8::is_ascii_digit) {
        return None;
    }
    let mut v: u64 = 0;
    for &b in bytes {
        v = v.checked_mul(10)?.checked_add(u64::from(b - b'0'))?;
    }
    Some(v)
}

/// `fnmatch(pattern, path, FNM_PATHNAME)`: `*`/`?` never cross `/`, `[...]` classes.
pub fn fnmatch_pathname(pattern: &[u8], path: &[u8]) -> bool {
    let (mut p, mut s) = (0usize, 0usize);
    let (mut star_p, mut star_s) = (usize::MAX, 0usize);
    while s < path.len() {
        if p < pattern.len() {
            match pattern[p] {
                b'*' => {
                    star_p = p;
                    star_s = s;
                    p += 1;
                    continue;
                }
                b'?' if path[s] != b'/' => {
                    p += 1;
                    s += 1;
                    continue;
                }
                b'[' if path[s] != b'/' => {
                    if let Some((matched, next)) = match_class(pattern, p, path[s]) {
                        if matched {
                            p = next;
                            s += 1;
                            continue;
                        }
                    } else if path[s] == b'[' {
                        p += 1;
                        s += 1;
                        continue;
                    }
                }
                c if c == path[s] && c != b'*' && c != b'?' && c != b'[' => {
                    p += 1;
                    s += 1;
                    continue;
                }
                _ => {}
            }
        }
        // Backtrack to the last `*`, which may absorb one more non-`/` byte.
        if star_p != usize::MAX && path[star_s] != b'/' {
            star_s += 1;
            s = star_s;
            p = star_p + 1;
            continue;
        }
        return false;
    }
    while p < pattern.len() && pattern[p] == b'*' {
        p += 1;
    }
    p == pattern.len()
}

fn match_class(pattern: &[u8], start: usize, c: u8) -> Option<(bool, usize)> {
    let mut i = start + 1;
    let negate = matches!(pattern.get(i), Some(b'!' | b'^'));
    if negate {
        i += 1;
    }
    let mut matched = false;
    let mut first = true;
    while i < pattern.len() {
        if pattern[i] == b']' && !first {
            return Some((matched != negate, i + 1));
        }
        first = false;
        if i + 2 < pattern.len() && pattern[i + 1] == b'-' && pattern[i + 2] != b']' {
            if pattern[i] <= c && c <= pattern[i + 2] {
                matched = true;
            }
            i += 3;
        } else {
            if pattern[i] == c {
                matched = true;
            }
            i += 1;
        }
    }
    None
}
