// SPDX-License-Identifier: Apache-2.0

use std::{
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
};

use bun_core::{Fd, ZBox};
use bun_sys::{File, O, S};
use serde_json::{Value, json};

use super::{Budget, charge};
use crate::{Limits, Result, WorkspaceError, check_cancel};

pub(super) static WRITERS: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub(crate) struct Sandbox {
    pub(super) path: PathBuf,
    root: File,
}

pub(super) struct Target {
    parent: File,
    name: ZBox,
    pub(super) relative: PathBuf,
}

pub(super) struct ReadFile {
    pub(super) bytes: Vec<u8>,
    pub(super) hash: String,
    pub(super) stat: bun_sys::Stat,
}

fn path_bytes(path: &Path) -> Result<&[u8]> {
    let bytes = path.as_os_str().as_encoded_bytes();
    if bun_core::strings::contains_char(bytes, 0) {
        return Err(WorkspaceError::Sandbox(path.display().to_string()));
    }
    Ok(bytes)
}

fn check_handle(file: &File, directory: bool) -> Result<bun_sys::Stat> {
    #[cfg(windows)]
    {
        use bun_windows_sys::externs as w;
        let mut basic: w::FILE_BASIC_INFORMATION = bun_core::ffi::zeroed();
        let mut status: w::IO_STATUS_BLOCK = bun_core::ffi::zeroed();
        // NOFOLLOW opens the reparse point itself; fstat alone reports it as a regular file on Windows.
        // SAFETY: the owned handle is live; both out buffers have the exact NT ABI and remain live during the call.
        let result = unsafe {
            w::ntdll::NtQueryInformationFile(
                file.fd().native(),
                &mut status,
                (&raw mut basic).cast(),
                core::mem::size_of::<w::FILE_BASIC_INFORMATION>() as u32,
                w::FILE_INFORMATION_CLASS::FileBasicInformation,
            )
        };
        if result != w::NTSTATUS::SUCCESS {
            return Err(WorkspaceError::Native(format!(
                "query file attributes failed: {result:?}"
            )));
        }
        if basic.FileAttributes & w::FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(WorkspaceError::Sandbox("reparse point".into()));
        }
    }
    let stat = file.stat()?;
    let mode = stat.st_mode as bun_sys::Mode;
    if (directory && !S::ISDIR(mode)) || (!directory && !bun_sys::is_regular_file(mode)) {
        return Err(WorkspaceError::Sandbox(
            "expected a regular file or directory".into(),
        ));
    }
    Ok(stat)
}

impl Sandbox {
    pub(crate) fn new(root: &Path) -> Result<Self> {
        let path = dunce::canonicalize(root)?;
        let root = File::openat(
            Fd::cwd(),
            path_bytes(&path)?,
            O::RDONLY | O::DIRECTORY | O::NOFOLLOW | O::CLOEXEC,
            0,
        )?;
        check_handle(&root, true)?;
        Ok(Self { path, root })
    }

    pub(super) fn target(&self, path: &Path) -> Result<Target> {
        let mut parts = Vec::new();
        for component in path.components() {
            match component {
                Component::Normal(part) => {
                    let bytes = part.as_encoded_bytes();
                    if bun_core::strings::contains_char(bytes, 0) {
                        return Err(WorkspaceError::Sandbox(path.display().to_string()));
                    }
                    #[cfg(windows)]
                    if bun_core::strings::contains_char(bytes, b':') || bytes.ends_with(b".") || bytes.ends_with(b" ") {
                        return Err(WorkspaceError::Sandbox(path.display().to_string()));
                    }
                    parts.push(bytes);
                }
                _ => return Err(WorkspaceError::Sandbox(path.display().to_string())),
            }
        }
        let Some(name) = parts.pop() else {
            return Err(WorkspaceError::Sandbox("empty relative file path".into()));
        };
        let mut parent = File::openat(
            &self.root,
            b".",
            O::RDONLY | O::DIRECTORY | O::NOFOLLOW | O::CLOEXEC,
            0,
        )?;
        for part in parts {
            parent = File::openat(
                &parent,
                part,
                O::RDONLY | O::DIRECTORY | O::NOFOLLOW | O::CLOEXEC,
                0,
            )?;
            check_handle(&parent, true)?;
        }
        Ok(Target {
            parent,
            name: ZBox::from_bytes(name),
            relative: path.to_owned(),
        })
    }

    pub(super) fn directory(&self, path: &Path) -> Result<File> {
        let file = if path.as_os_str().is_empty() {
            File::openat(
                &self.root,
                b".",
                O::RDONLY | O::DIRECTORY | O::NOFOLLOW | O::CLOEXEC,
                0,
            )?
        } else {
            let target = self.target(path)?;
            File::openat(
                &target.parent,
                target.name.as_bytes(),
                O::RDONLY | O::DIRECTORY | O::NOFOLLOW | O::CLOEXEC,
                0,
            )?
        };
        check_handle(&file, true)?;
        Ok(file)
    }

    pub(super) fn read(
        &self,
        path: &Path,
        limits: &Limits,
        budget: &Budget,
        cancel: &AtomicBool,
    ) -> Result<ReadFile> {
        self.target(path)?.read(limits, budget, cancel)
    }

    pub(super) fn can(&self, path: &Path, write: bool, cancel: &AtomicBool) -> Result<Value> {
        check_cancel(cancel)?;
        let target = self.target(path)?;
        let result = File::openat(
            &target.parent,
            target.name.as_bytes(),
            (if write { O::RDWR } else { O::RDONLY }) | O::NOFOLLOW | O::CLOEXEC | O::NONBLOCK,
            0,
        );
        match result {
            Ok(file) => {
                check_handle(&file, false)?;
                Ok(json!({ "path": path, "allowed": true, "write": write, "exists": true }))
            }
            Err(error) => Ok(
                json!({ "path": path, "allowed": false, "write": write, "error": error.to_string() }),
            ),
        }
    }
}

impl Target {
    fn open_read(&self) -> Result<(File, bun_sys::Stat)> {
        let file = File::openat(
            &self.parent,
            self.name.as_bytes(),
            O::RDONLY | O::NOFOLLOW | O::CLOEXEC | O::NONBLOCK,
            0,
        )?;
        let stat = check_handle(&file, false)?;
        Ok((file, stat))
    }

    pub(super) fn metadata(&self) -> Result<bun_sys::Stat> {
        Ok(self.open_read()?.1)
    }

    pub(super) fn read(
        &self,
        limits: &Limits,
        budget: &Budget,
        cancel: &AtomicBool,
    ) -> Result<ReadFile> {
        self.read_inner(limits, budget, cancel, None)
    }

    fn read_inner(
        &self,
        limits: &Limits,
        budget: &Budget,
        cancel: &AtomicBool,
        prepaid: Option<usize>,
    ) -> Result<ReadFile> {
        check_cancel(cancel)?;
        let (file, stat) = self.open_read()?;
        let declared =
            usize::try_from(stat.st_size).map_err(|_| WorkspaceError::Limit("file bytes"))?;
        if declared > limits.max_file_bytes {
            return Err(WorkspaceError::Limit("file bytes"));
        }
        let mut bytes = Vec::with_capacity(declared);
        let mut buffer = [0_u8; 16384];
        loop {
            check_cancel(cancel)?;
            let count = file.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            if bytes
                .len()
                .checked_add(count)
                .is_none_or(|size| size > limits.max_file_bytes)
            {
                return Err(WorkspaceError::Limit("file bytes"));
            }
            if let Some(prepaid) = prepaid {
                if bytes.len() + count > prepaid {
                    return Err(WorkspaceError::Conflict(
                        self.relative.display().to_string(),
                    ));
                }
            } else {
                charge(
                    &budget.source_bytes,
                    count,
                    limits.max_source_bytes,
                    "source bytes",
                )?;
            }
            bytes.extend_from_slice(&buffer[..count]);
        }
        if !same_revision(&stat, &file.stat()?) || bytes.len() != declared {
            return Err(WorkspaceError::Conflict(
                self.relative.display().to_string(),
            ));
        }
        let hash = blake3::hash(&bytes).to_hex().to_string();
        Ok(ReadFile { bytes, hash, stat })
    }

    pub(super) fn replace(
        &self,
        bytes: &[u8],
        expected: &ReadFile,
        limits: &Limits,
        budget: &Budget,
        cancel: &AtomicBool,
    ) -> Result<()> {
        check_cancel(cancel)?;
        if expected.stat.st_nlink > 1 {
            return Err(WorkspaceError::Invalid(format!(
                "refusing to replace a hard-linked file: {}",
                self.relative.display()
            )));
        }
        let writable = File::openat(
            &self.parent,
            self.name.as_bytes(),
            O::RDWR | O::NOFOLLOW | O::CLOEXEC | O::NONBLOCK,
            0,
        )?;
        let stat = check_handle(&writable, false)?;
        if !same_revision(&stat, &expected.stat) {
            return Err(WorkspaceError::Conflict(
                self.relative.display().to_string(),
            ));
        }
        let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let name = ZBox::from_bytes(format!(".buv-edit-{}-{sequence}.tmp", std::process::id()));
        let file = File::openat(
            &self.parent,
            name.as_bytes(),
            O::WRONLY | O::CREAT | O::EXCL | O::NOFOLLOW | O::CLOEXEC,
            0o600,
        )?;
        let mut pending = PendingWrite {
            parent: &self.parent,
            name: &name,
            committed: false,
        };
        #[cfg(windows)]
        super::windows_metadata::preserve(
            &self.parent,
            Path::new(
                std::str::from_utf8(name.as_bytes())
                    .map_err(|error| WorkspaceError::Invalid(error.to_string()))?,
            ),
            &writable,
        )?;
        for chunk in bytes.chunks(16384) {
            check_cancel(cancel)?;
            let mut remainder = chunk;
            while !remainder.is_empty() {
                let written = bun_sys::write(file.fd(), remainder)?;
                if written == 0 {
                    return Err(std::io::Error::from(std::io::ErrorKind::WriteZero).into());
                }
                remainder = &remainder[written..];
            }
        }
        #[cfg(unix)]
        {
            bun_sys::fchown(file.fd(), expected.stat.st_uid, expected.stat.st_gid)?;
            bun_sys::fchmod(file.fd(), expected.stat.st_mode as bun_sys::Mode & 0o777)?;
        }
        #[cfg(unix)]
        bun_sys::fsync(file.fd())?;
        #[cfg(windows)]
        {
            super::windows_metadata::flush(&file)?;
        }
        drop(writable);
        drop(file);
        let current = self.read_inner(limits, budget, cancel, Some(expected.bytes.len()))?;
        if current.hash != expected.hash || !same_revision(&current.stat, &expected.stat) {
            return Err(WorkspaceError::Conflict(
                self.relative.display().to_string(),
            ));
        }
        check_cancel(cancel)?;
        bun_sys::renameat(
            &self.parent,
            name.as_zstr(),
            &self.parent,
            self.name.as_zstr(),
        )?;
        pending.committed = true;
        #[cfg(unix)]
        bun_sys::fsync(self.parent.fd()).map_err(|error| {
            WorkspaceError::Durability(format!("{}: {error}", self.relative.display()))
        })?;
        Ok(())
    }
}

fn same_revision(a: &bun_sys::Stat, b: &bun_sys::Stat) -> bool {
    let am = bun_sys::stat_mtime(a);
    let bm = bun_sys::stat_mtime(b);
    let ac = bun_sys::stat_ctime(a);
    let bc = bun_sys::stat_ctime(b);
    a.st_dev == b.st_dev
        && a.st_ino == b.st_ino
        && a.st_size == b.st_size
        && a.st_mode == b.st_mode
        && am.sec == bm.sec
        && am.nsec == bm.nsec
        && ac.sec == bc.sec
        && ac.nsec == bc.nsec
}

struct PendingWrite<'a> {
    parent: &'a File,
    name: &'a ZBox,
    committed: bool,
}

impl Drop for PendingWrite<'_> {
    fn drop(&mut self) {
        if !self.committed {
            let _ = bun_sys::unlinkat(self.parent, self.name.as_zstr());
        }
    }
}
