//! A root filesystem seen from the host. Paths are relative to the root and
//! `/`-separated; symlinks met in parent components are resolved inside the
//! root (an absolute link target means the root, never the host `/`), so a
//! package cannot write outside it.

use super::super::{Error, Result, fs, lossy};
use super::tar::{Entry, Kind};
use super::crypto::{Alg, digest};
use bun_core::strings;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileType {
    File,
    Dir,
    Symlink,
    Other,
}

#[derive(Clone, Copy, Debug)]
pub struct Meta {
    pub kind: FileType,
    pub mode: u32,
    pub uid: u32,
    pub gid: u32,
    pub size: u64,
}

/// What [`Root::apply`] did with an archive entry.
#[derive(Debug, PartialEq, Eq)]
pub enum Applied {
    Done,
    /// Not representable on this host (device node without privileges, symlink on Windows…).
    Skipped(String),
}

#[derive(Clone, Debug)]
pub struct Root {
    /// Absolute host path, without a trailing separator.
    pub dir: Vec<u8>,
}

const MAX_LINK_HOPS: usize = 40;

/// Splits `rel` into normal components, rejecting `..` that would leave the root.
pub fn normalize(rel: &[u8]) -> Vec<&[u8]> {
    let mut parts: Vec<&[u8]> = Vec::new();
    for part in strings::split(rel, b"/") {
        match part {
            b"" | b"." => {}
            b".." => {
                parts.pop();
            }
            p => parts.push(p),
        }
    }
    parts
}

pub fn join_rel(parts: &[&[u8]]) -> Vec<u8> {
    let mut out = Vec::new();
    for (i, p) in parts.iter().enumerate() {
        if i > 0 {
            out.push(b'/');
        }
        out.extend_from_slice(p);
    }
    out
}

impl Root {
    pub fn new(dir: &[u8]) -> Root {
        let mut dir = dir.to_vec();
        while dir.len() > 1 && matches!(dir.last(), Some(b'/' | b'\\')) {
            dir.pop();
        }
        Root { dir }
    }

    /// Host path of `rel` without resolving symlinks.
    pub fn host(&self, rel: &[u8]) -> Vec<u8> {
        let parts = normalize(rel);
        let mut out = self.dir.clone();
        for p in parts {
            out.push(if cfg!(windows) { b'\\' } else { b'/' });
            out.extend_from_slice(p);
        }
        out
    }

    /// Canonical root-relative path of `rel` with every parent component's
    /// symlinks resolved inside the root (the last component is kept as is).
    pub fn resolve_parents(&self, rel: &[u8]) -> Vec<u8> {
        let mut queue: std::collections::VecDeque<Vec<u8>> =
            normalize(rel).into_iter().map(<[u8]>::to_vec).collect();
        let mut done: Vec<Vec<u8>> = Vec::new();
        let mut hops = 0usize;
        while let Some(part) = queue.pop_front() {
            if part == b".." {
                done.pop();
                continue;
            }
            done.push(part);
            if queue.is_empty() || hops > MAX_LINK_HOPS {
                continue;
            }
            let current = join_rel(&done.iter().map(Vec::as_slice).collect::<Vec<_>>());
            let Some(target) = self.read_link(&current) else {
                continue;
            };
            hops += 1;
            done.pop();
            if target.first() == Some(&b'/') {
                done.clear();
            }
            let parts: Vec<&[u8]> = strings::split(&target, b"/").collect();
            for p in parts.into_iter().rev() {
                if p != b"" && p != b"." {
                    queue.push_front(p.to_vec());
                }
            }
        }
        join_rel(&done.iter().map(Vec::as_slice).collect::<Vec<_>>())
    }

    /// Host path of `rel` after resolving symlinked parents inside the root.
    pub fn resolved_host(&self, rel: &[u8]) -> Vec<u8> {
        self.host(&self.resolve_parents(rel))
    }

    pub fn read(&self, rel: &[u8]) -> Option<Vec<u8>> {
        fs::read(&self.resolved_host(rel))
    }

    pub fn exists(&self, rel: &[u8]) -> bool {
        self.lstat(rel).is_some()
    }

    /// Atomically replaces `rel` (database files).
    pub fn write_atomic(&self, rel: &[u8], data: &[u8], mode: u32) -> Result<()> {
        let path = self.resolved_host(rel);
        fs::mkdir_p(fs::parent(&path))?;
        let mut tmp = path.clone();
        tmp.extend_from_slice(b".bun-new");
        fs::write(&tmp, data)?;
        sys::chmod(&tmp, mode);
        sys::rename(&tmp, &path)
    }

    pub fn mkdirs(&self, rel: &[u8], mode: u32) -> Result<()> {
        let parts = normalize(rel);
        for i in 1..=parts.len() {
            let sub = join_rel(&parts[..i]);
            let host = self.resolved_host(&sub);
            match sys::lstat(&host) {
                Some(m) if m.kind == FileType::Dir => {}
                Some(m) if m.kind == FileType::Symlink => {}
                Some(_) => {
                    return Err(Error::Io(format!("{} exists and is not a directory", lossy(&host))));
                }
                None => sys::mkdir(&host, mode)?,
            }
        }
        Ok(())
    }

    pub fn lstat(&self, rel: &[u8]) -> Option<Meta> {
        sys::lstat(&self.resolved_host(rel))
    }

    pub fn read_link(&self, rel: &[u8]) -> Option<Vec<u8>> {
        sys::read_link(&self.host(rel))
    }

    /// Removes a file, symlink or empty directory. `false` when it is still there.
    pub fn remove(&self, rel: &[u8]) -> bool {
        let host = self.resolved_host(rel);
        match sys::lstat(&host) {
            None => true,
            Some(m) if m.kind == FileType::Dir => sys::rmdir(&host),
            Some(_) => sys::unlink(&host),
        }
    }

    pub fn rename(&self, from: &[u8], to: &[u8]) -> Result<()> {
        sys::rename(&self.resolved_host(from), &self.resolved_host(to))
    }

    /// Digest of a regular file's contents or of a symlink's target.
    pub fn digest(&self, rel: &[u8], alg: Alg) -> Option<Vec<u8>> {
        let host = self.resolved_host(rel);
        match sys::lstat(&host)?.kind {
            FileType::Symlink => Some(digest(alg, &sys::read_link(&host)?)),
            FileType::File => Some(digest(alg, &fs::read(&host)?)),
            _ => None,
        }
    }

    /// Writes one archive entry at `rel`, with `owner` applied when running as root.
    /// Regular files are written next to the target and renamed over it, so a
    /// running binary (busybox during its own upgrade) is replaced, not truncated.
    pub fn apply(&self, entry: &Entry<'_>, rel: &[u8], owner: (u32, u32), data: &[u8]) -> Result<Applied> {
        let rel = self.resolve_parents(rel);
        if rel.is_empty() {
            return Ok(Applied::Done);
        }
        let parts = normalize(&rel);
        if parts.len() > 1 {
            self.mkdirs(&join_rel(&parts[..parts.len() - 1]), 0o755)?;
        }
        let host = self.host(&rel);
        let superuser = super::is_superuser();
        let mode = entry.mode & 0o7777;
        match entry.kind {
            Kind::Dir => {
                match sys::lstat(&host) {
                    Some(m) if m.kind == FileType::Dir => {}
                    Some(m) if m.kind == FileType::Symlink => return Ok(Applied::Done),
                    Some(_) => {
                        sys::unlink(&host);
                        sys::mkdir(&host, mode)?;
                    }
                    None => sys::mkdir(&host, mode)?,
                }
                if superuser {
                    sys::lchown(&host, owner.0, owner.1);
                }
                sys::chmod(&host, mode);
            }
            Kind::File => {
                let mut tmp = host.clone();
                tmp.extend_from_slice(b".bun-new");
                sys::unlink(&tmp);
                fs::write(&tmp, data)?;
                if superuser {
                    sys::lchown(&tmp, owner.0, owner.1);
                }
                sys::chmod(&tmp, mode);
                sys::set_mtime(&tmp, entry.mtime);
                if superuser {
                    for (name, value) in entry.xattrs() {
                        sys::set_xattr(&tmp, name, value);
                    }
                }
                if let Some(m) = sys::lstat(&host) {
                    if m.kind == FileType::Dir {
                        sys::unlink(&tmp);
                        return Err(Error::Io(format!("{} is a directory", lossy(&host))));
                    }
                }
                sys::rename(&tmp, &host)?;
            }
            Kind::Symlink => {
                if let Some(m) = sys::lstat(&host) {
                    if m.kind == FileType::Dir {
                        return Err(Error::Io(format!("{} is a directory", lossy(&host))));
                    }
                    sys::unlink(&host);
                }
                if !sys::symlink(&entry.link, &host) {
                    return Ok(Applied::Skipped(format!("cannot create symlink {}", lossy(&rel))));
                }
                if superuser {
                    sys::lchown(&host, owner.0, owner.1);
                }
            }
            Kind::Hardlink => {
                let target = self.resolved_host(&entry.link);
                if sys::lstat(&host).is_some() {
                    sys::unlink(&host);
                }
                if !sys::hardlink(&target, &host) {
                    // Fall back to a copy (filesystems without hard links).
                    let Some(bytes) = fs::read(&target) else {
                        return Err(Error::Io(format!(
                            "hard link target {} of {} is missing",
                            lossy(&entry.link),
                            lossy(&rel)
                        )));
                    };
                    fs::write(&host, &bytes)?;
                    sys::chmod(&host, mode);
                }
            }
            Kind::Char | Kind::Block | Kind::Fifo => {
                if sys::lstat(&host).is_some() {
                    sys::unlink(&host);
                }
                if !sys::mknod(&host, entry.kind, mode, entry.dev_major, entry.dev_minor) {
                    return Ok(Applied::Skipped(format!(
                        "cannot create device node {} (needs root)",
                        lossy(&rel)
                    )));
                }
                if superuser {
                    sys::lchown(&host, owner.0, owner.1);
                }
                sys::chmod(&host, mode);
            }
        }
        Ok(Applied::Done)
    }

    /// `dev/null`, `zero`, `random`, `urandom`, `console` for scripts run
    /// without a mount namespace (apk-tools `make_device_tree`).
    pub fn make_device_tree(&self) {
        if self.exists(b"dev/null") {
            return;
        }
        let _ = self.mkdirs(b"dev", 0o755);
        for (name, mode, major, minor) in [
            (&b"dev/null"[..], 0o666, 1, 3),
            (b"dev/zero", 0o666, 1, 5),
            (b"dev/random", 0o666, 1, 8),
            (b"dev/urandom", 0o666, 1, 9),
            (b"dev/console", 0o600, 5, 1),
        ] {
            let host = self.host(name);
            if sys::lstat(&host).is_none() {
                sys::mknod(&host, Kind::Char, mode, major, minor);
            }
        }
    }
}

#[cfg(unix)]
mod sys {
    use super::super::super::{Error, Result, fs, lossy};
    use super::super::tar::Kind;
    use super::{FileType, Meta};
    use core::ffi::c_char;

    fn c(path: &[u8]) -> Vec<u8> {
        fs::zpath(path)
    }

    fn ptr(p: &[u8]) -> *const c_char {
        p.as_ptr().cast::<c_char>()
    }

    pub(super) fn lstat(path: &[u8]) -> Option<Meta> {
        let p = c(path);
        let mut st = core::mem::MaybeUninit::<libc::stat>::uninit();
        // SAFETY: `p` is NUL-terminated; `st` is written by lstat on success.
        if unsafe { libc::lstat(ptr(&p), st.as_mut_ptr()) } != 0 {
            return None;
        }
        // SAFETY: lstat returned 0, so `st` is initialized.
        let st = unsafe { st.assume_init() };
        let fmt = st.st_mode & libc::S_IFMT;
        let kind = if fmt == libc::S_IFREG {
            FileType::File
        } else if fmt == libc::S_IFDIR {
            FileType::Dir
        } else if fmt == libc::S_IFLNK {
            FileType::Symlink
        } else {
            FileType::Other
        };
        Some(Meta {
            kind,
            mode: (st.st_mode & 0o7777) as u32,
            uid: st.st_uid,
            gid: st.st_gid,
            size: st.st_size as u64,
        })
    }

    pub(super) fn read_link(path: &[u8]) -> Option<Vec<u8>> {
        let p = c(path);
        let mut buf = vec![0u8; 4096];
        // SAFETY: `p` is NUL-terminated and `buf` is writable for its length.
        let n = unsafe { libc::readlink(ptr(&p), buf.as_mut_ptr().cast::<c_char>(), buf.len()) };
        if n < 0 {
            return None;
        }
        buf.truncate(n as usize);
        Some(buf)
    }

    pub(super) fn mkdir(path: &[u8], mode: u32) -> Result<()> {
        let p = c(path);
        // SAFETY: `p` is NUL-terminated.
        if unsafe { libc::mkdir(ptr(&p), mode as libc::mode_t) } != 0 {
            let err = std::io::Error::last_os_error();
            if err.raw_os_error() != Some(libc::EEXIST) {
                return Err(Error::Io(format!("mkdir {}: {err}", lossy(path))));
            }
        }
        Ok(())
    }

    pub(super) fn chmod(path: &[u8], mode: u32) {
        let p = c(path);
        // SAFETY: `p` is NUL-terminated.
        unsafe { libc::chmod(ptr(&p), mode as libc::mode_t) };
    }

    pub(super) fn lchown(path: &[u8], uid: u32, gid: u32) {
        let p = c(path);
        // SAFETY: `p` is NUL-terminated.
        unsafe { libc::lchown(ptr(&p), uid, gid) };
    }

    pub(super) fn set_mtime(path: &[u8], mtime: i64) {
        let p = c(path);
        let t = libc::timespec { tv_sec: mtime as _, tv_nsec: 0 };
        let times = [t, t];
        // SAFETY: `p` is NUL-terminated and `times` holds two timespecs.
        unsafe { libc::utimensat(libc::AT_FDCWD, ptr(&p), times.as_ptr(), libc::AT_SYMLINK_NOFOLLOW) };
    }

    pub(super) fn set_xattr(path: &[u8], name: &[u8], value: &[u8]) {
        #[cfg(target_os = "linux")]
        {
            let p = c(path);
            let n = c(name);
            // SAFETY: both strings are NUL-terminated; `value` is valid for its length.
            unsafe { libc::lsetxattr(ptr(&p), ptr(&n), value.as_ptr().cast(), value.len(), 0) };
        }
        #[cfg(not(target_os = "linux"))]
        let _ = (path, name, value);
    }

    pub(super) fn rename(from: &[u8], to: &[u8]) -> Result<()> {
        let (f, t) = (c(from), c(to));
        // SAFETY: both paths are NUL-terminated.
        if unsafe { libc::rename(ptr(&f), ptr(&t)) } != 0 {
            let err = std::io::Error::last_os_error();
            return Err(Error::Io(format!("rename {} -> {}: {err}", lossy(from), lossy(to))));
        }
        Ok(())
    }

    pub(super) fn unlink(path: &[u8]) -> bool {
        let p = c(path);
        // SAFETY: `p` is NUL-terminated.
        unsafe { libc::unlink(ptr(&p)) == 0 }
    }

    pub(super) fn rmdir(path: &[u8]) -> bool {
        let p = c(path);
        // SAFETY: `p` is NUL-terminated.
        unsafe { libc::rmdir(ptr(&p)) == 0 }
    }

    pub(super) fn symlink(target: &[u8], path: &[u8]) -> bool {
        let (t, p) = (c(target), c(path));
        // SAFETY: both paths are NUL-terminated.
        unsafe { libc::symlink(ptr(&t), ptr(&p)) == 0 }
    }

    pub(super) fn hardlink(target: &[u8], path: &[u8]) -> bool {
        let (t, p) = (c(target), c(path));
        // SAFETY: both paths are NUL-terminated.
        unsafe { libc::link(ptr(&t), ptr(&p)) == 0 }
    }

    pub(super) fn mknod(path: &[u8], kind: Kind, mode: u32, major: u32, minor: u32) -> bool {
        let p = c(path);
        let fmt = match kind {
            Kind::Char => libc::S_IFCHR,
            Kind::Block => libc::S_IFBLK,
            _ => libc::S_IFIFO,
        };
        let dev = libc::makedev(major, minor);
        // SAFETY: `p` is NUL-terminated.
        unsafe { libc::mknod(ptr(&p), fmt | mode as libc::mode_t, dev) == 0 }
    }
}

#[cfg(not(unix))]
mod sys {
    use super::super::super::{Error, Result, fs, lossy};
    use super::super::tar::Kind;
    use super::{FileType, Meta};

    fn z(path: &[u8]) -> Vec<u8> {
        fs::zpath(path)
    }

    pub(super) fn lstat(path: &[u8]) -> Option<Meta> {
        let p = z(path);
        let st = bun_sys::lstat(bun_core::ZStr::from_buf(&p, path.len())).ok()?;
        let mode = st.st_mode as u32;
        let kind = match mode & 0o170000 {
            0o100000 => FileType::File,
            0o040000 => FileType::Dir,
            0o120000 => FileType::Symlink,
            _ => FileType::Other,
        };
        Some(Meta { kind, mode: mode & 0o7777, uid: 0, gid: 0, size: st.st_size as u64 })
    }

    pub(super) fn read_link(path: &[u8]) -> Option<Vec<u8>> {
        let p = z(path);
        let mut buf = vec![0u8; 4096];
        let n = bun_sys::readlink(bun_core::ZStr::from_buf(&p, path.len()), &mut buf).ok()?;
        buf.truncate(n);
        for b in &mut buf {
            if *b == b'\\' {
                *b = b'/';
            }
        }
        Some(buf)
    }

    pub(super) fn mkdir(path: &[u8], _mode: u32) -> Result<()> {
        fs::mkdir_p(path)
    }

    pub(super) fn chmod(_path: &[u8], _mode: u32) {}

    pub(super) fn lchown(_path: &[u8], _uid: u32, _gid: u32) {}

    pub(super) fn set_mtime(_path: &[u8], _mtime: i64) {}

    pub(super) fn set_xattr(_path: &[u8], _name: &[u8], _value: &[u8]) {}

    pub(super) fn rename(from: &[u8], to: &[u8]) -> Result<()> {
        let (f, t) = (z(from), z(to));
        bun_sys::rename(bun_core::ZStr::from_buf(&f, from.len()), bun_core::ZStr::from_buf(&t, to.len()))
            .map_err(|e| Error::Io(format!("rename {} -> {}: {e}", lossy(from), lossy(to))))
    }

    pub(super) fn unlink(path: &[u8]) -> bool {
        let p = z(path);
        bun_sys::unlink(bun_core::ZStr::from_buf(&p, path.len())).is_ok()
    }

    pub(super) fn rmdir(path: &[u8]) -> bool {
        let p = z(path);
        bun_sys::rmdir(bun_core::ZStr::from_buf(&p, path.len())).is_ok()
    }

    pub(super) fn symlink(target: &[u8], path: &[u8]) -> bool {
        let (t, p) = (z(target), z(path));
        bun_sys::symlink(bun_core::ZStr::from_buf(&t, target.len()), bun_core::ZStr::from_buf(&p, path.len()))
            .is_ok()
    }

    pub(super) fn hardlink(_target: &[u8], _path: &[u8]) -> bool {
        false
    }

    pub(super) fn mknod(_path: &[u8], _kind: Kind, _mode: u32, _major: u32, _minor: u32) -> bool {
        false
    }
}
