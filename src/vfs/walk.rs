// SPDX-License-Identifier: Apache-2.0
//! Parallel directory traversal into a [`Draft`]: `FindFirstFileExW` (basic info, large fetch) on
//! Windows, `readdir` + `lstat` elsewhere. Paths are UTF-8 bytes ending with a separator.

use std::sync::{
    Condvar, Mutex,
    atomic::{AtomicBool, AtomicU32, AtomicUsize, Ordering},
};

use crate::{
    Result, SEP, VfsError,
    index::Exclusions,
    table::{Draft, FLAG_DIR, FLAG_HIDDEN, FLAG_LINK, ROOT_PARENT, UNKNOWN_MTIME, UNKNOWN_SIZE},
};

pub(crate) struct WalkConfig<'a> {
    pub threads: usize,
    pub hidden: bool,
    #[cfg(not(windows))]
    pub stat: bool,
    #[cfg(not(windows))]
    pub one_file_system: bool,
    pub max_entries: usize,
    pub exclusions: &'a Exclusions,
}

struct Job {
    id: u32,
    path: Vec<u8>,
}

struct Queue {
    jobs: Vec<Job>,
    active: usize,
    done: bool,
}

#[derive(Default)]
struct Local {
    ids: Vec<u32>,
    parents: Vec<u32>,
    flags: Vec<u16>,
    sizes: Vec<u64>,
    mtimes: Vec<i64>,
    starts: Vec<u32>,
    lens: Vec<u32>,
    arena: Vec<u8>,
    errors: usize,
}

/// One listed child.
pub(crate) struct Child<'n> {
    pub name: &'n [u8],
    pub flags: u16,
    pub size: u64,
    pub mtime: i64,
    /// A real directory (not a link or junction) that may be descended into.
    pub descend: bool,
}

/// `dir` with a trailing separator.
pub(crate) fn dir_path(dir: &[u8]) -> Vec<u8> {
    let mut path = dir.to_vec();
    if path.last() != Some(&SEP) && path.last() != Some(&b'/') {
        path.push(SEP);
    }
    path
}

pub(crate) fn join(parent: &[u8], name: &[u8]) -> Vec<u8> {
    let mut path = Vec::with_capacity(parent.len() + name.len() + 1);
    path.extend_from_slice(parent);
    path.extend_from_slice(name);
    path.push(SEP);
    path
}

/// Walks the directory `root` (UTF-8, trailing separator) in parallel; its children get [`ROOT_PARENT`].
/// Returns the draft and the number of directories that could not be listed.
pub(crate) fn walk(
    root: &[u8],
    config: &WalkConfig<'_>,
    cancel: &AtomicBool,
) -> Result<(Draft, usize)> {
    let device = imp::device(root);
    let queue = Mutex::new(Queue {
        jobs: vec![Job {
            id: ROOT_PARENT,
            path: root.to_vec(),
        }],
        active: 0,
        done: false,
    });
    let ready = Condvar::new();
    let next_id = AtomicU32::new(0);
    let overflow = AtomicUsize::new(0);
    let worker = || {
        let mut local = Local::default();
        let mut pending = Vec::new();
        loop {
            let job = {
                let mut state = queue.lock().unwrap_or_else(|e| e.into_inner());
                loop {
                    if state.done {
                        break None;
                    }
                    if let Some(job) = state.jobs.pop() {
                        state.active += 1;
                        break Some(job);
                    }
                    if state.active == 0 {
                        state.done = true;
                        ready.notify_all();
                        break None;
                    }
                    state = ready.wait(state).unwrap_or_else(|e| e.into_inner());
                }
            };
            let Some(job) = job else { break };
            if !cancel.load(Ordering::Relaxed) {
                let listed = list_dir(&job.path, config, device, &mut |child: Child<'_>| {
                    let id = next_id.fetch_add(1, Ordering::Relaxed);
                    if id as usize >= config.max_entries {
                        overflow.fetch_add(1, Ordering::Relaxed);
                        return;
                    }
                    local.ids.push(id);
                    local.parents.push(job.id);
                    local.flags.push(child.flags);
                    local.sizes.push(child.size);
                    local.mtimes.push(child.mtime);
                    local.starts.push(local.arena.len() as u32);
                    local.lens.push(child.name.len() as u32);
                    local.arena.extend_from_slice(child.name);
                    if child.descend && !config.exclusions.excludes(&job.path, child.name) {
                        pending.push(Job {
                            id,
                            path: join(&job.path, child.name),
                        });
                    }
                });
                if listed.is_err() {
                    local.errors += 1;
                }
            }
            let mut state = queue.lock().unwrap_or_else(|e| e.into_inner());
            state.active -= 1;
            if !pending.is_empty() {
                state.jobs.append(&mut pending);
                ready.notify_all();
            } else if state.active == 0 && state.jobs.is_empty() {
                state.done = true;
                ready.notify_all();
            }
        }
        local
    };
    let locals: Vec<Local> = std::thread::scope(|scope| {
        #[allow(
            clippy::needless_collect,
            reason = "every worker is spawned before the first join"
        )]
        let handles: Vec<_> = (0..config.threads.max(1))
            .map(|_| scope.spawn(worker))
            .collect();
        handles
            .into_iter()
            .filter_map(|handle| handle.join().ok())
            .collect()
    });
    crate::check_cancel(cancel)?;
    if overflow.load(Ordering::Relaxed) > 0 {
        return Err(VfsError::Limit("vfs max_entries"));
    }
    let count = next_id.load(Ordering::Relaxed) as usize;
    let mut draft = Draft {
        parents: vec![ROOT_PARENT; count],
        flags: vec![0; count],
        sizes: vec![UNKNOWN_SIZE; count],
        mtimes: vec![UNKNOWN_MTIME; count],
        frns: Vec::new(),
        name_starts: vec![0; count],
        name_lens: vec![0; count],
        arena: Vec::with_capacity(locals.iter().map(|local| local.arena.len()).sum()),
    };
    let mut errors = 0;
    for local in locals {
        let base = draft.arena.len() as u32;
        draft.arena.extend_from_slice(&local.arena);
        errors += local.errors;
        for (index, id) in local.ids.iter().enumerate() {
            let id = *id as usize;
            draft.parents[id] = local.parents[index];
            draft.flags[id] = local.flags[index];
            draft.sizes[id] = local.sizes[index];
            draft.mtimes[id] = local.mtimes[index];
            draft.name_starts[id] = base + local.starts[index];
            draft.name_lens[id] = local.lens[index];
        }
    }
    Ok((draft, errors))
}

/// Lists one directory (`path` ends with a separator).
pub(crate) fn list_dir(
    path: &[u8],
    config: &WalkConfig<'_>,
    device: u64,
    emit: &mut dyn FnMut(Child<'_>),
) -> Result<()> {
    imp::list_dir(path, config, device, emit)
}

/// Modification time (Unix milliseconds) of a directory, or `None` when it is gone.
pub(crate) fn dir_mtime(path: &[u8]) -> Option<i64> {
    imp::dir_mtime(path)
}

#[cfg(windows)]
mod imp {
    use super::{Child, FLAG_DIR, FLAG_HIDDEN, FLAG_LINK, UNKNOWN_MTIME, UNKNOWN_SIZE, WalkConfig};
    use crate::{Result, table::FLAG_SYSTEM};

    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
    const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x10;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    const FIND_EX_INFO_BASIC: i32 = 1;
    const FIND_EX_SEARCH_NAME_MATCH: i32 = 0;
    const FIND_FIRST_EX_LARGE_FETCH: u32 = 2;
    const INVALID_HANDLE_VALUE: isize = -1;
    const GET_FILE_EX_INFO_STANDARD: i32 = 0;

    #[repr(C)]
    pub(crate) struct FileTime {
        low: u32,
        high: u32,
    }

    #[repr(C)]
    struct FindData {
        attributes: u32,
        creation: FileTime,
        access: FileTime,
        write: FileTime,
        size_high: u32,
        size_low: u32,
        reserved0: u32,
        reserved1: u32,
        name: [u16; 260],
        alternate: [u16; 14],
    }

    #[repr(C)]
    struct AttributeData {
        attributes: u32,
        creation: FileTime,
        access: FileTime,
        write: FileTime,
        size_high: u32,
        size_low: u32,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn FindFirstFileExW(
            name: *const u16,
            level: i32,
            data: *mut FindData,
            search: i32,
            filter: *const core::ffi::c_void,
            flags: u32,
        ) -> isize;
        fn FindNextFileW(handle: isize, data: *mut FindData) -> i32;
        fn FindClose(handle: isize) -> i32;
        fn GetFileAttributesExW(name: *const u16, level: i32, data: *mut AttributeData) -> i32;
    }

    struct Find(isize);
    impl Drop for Find {
        fn drop(&mut self) {
            // SAFETY: the handle came from FindFirstFileExW and is closed exactly once.
            unsafe { FindClose(self.0) };
        }
    }

    fn unix_millis(time: &FileTime) -> i64 {
        let ticks = (u64::from(time.high) << 32 | u64::from(time.low)) as i64;
        if ticks == 0 {
            return UNKNOWN_MTIME;
        }
        (ticks - 116_444_736_000_000_000) / 10_000
    }

    /// `\\?\`-prefixed, NUL-terminated UTF-16 of `path` plus `suffix`.
    fn wide(path: &[u8], suffix: &str) -> Vec<u16> {
        let text = String::from_utf8_lossy(path);
        let mut wide: Vec<u16> = if text.starts_with(r"\\") {
            Vec::new()
        } else {
            r"\\?\".encode_utf16().collect()
        };
        wide.extend(text.encode_utf16());
        wide.extend(suffix.encode_utf16());
        wide.push(0);
        wide
    }

    pub(super) fn device(_path: &[u8]) -> u64 {
        0
    }

    pub(super) fn dir_mtime(path: &[u8]) -> Option<i64> {
        let trimmed = if path.len() > 3 {
            path.strip_suffix(b"\\").unwrap_or(path)
        } else {
            path
        };
        let wide = wide(trimmed, "");
        // SAFETY: plain-data out parameter; all-zero is a valid value.
        let mut data: AttributeData = unsafe { core::mem::zeroed() };
        // SAFETY: `wide` is NUL-terminated and `data` is a live out buffer for the call.
        let ok = unsafe {
            GetFileAttributesExW(wide.as_ptr(), GET_FILE_EX_INFO_STANDARD, &raw mut data)
        };
        (ok != 0 && data.attributes & FILE_ATTRIBUTE_DIRECTORY != 0)
            .then(|| unix_millis(&data.write))
    }

    pub(super) fn list_dir(
        path: &[u8],
        config: &WalkConfig<'_>,
        _device: u64,
        emit: &mut dyn FnMut(Child<'_>),
    ) -> Result<()> {
        let pattern = wide(path, "*");
        // SAFETY: plain-data out parameter; all-zero is a valid value.
        let mut data: FindData = unsafe { core::mem::zeroed() };
        // SAFETY: `pattern` is NUL-terminated and `data` is a live out buffer for the call.
        let handle = unsafe {
            FindFirstFileExW(
                pattern.as_ptr(),
                FIND_EX_INFO_BASIC,
                &raw mut data,
                FIND_EX_SEARCH_NAME_MATCH,
                core::ptr::null(),
                FIND_FIRST_EX_LARGE_FETCH,
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            return Err(std::io::Error::last_os_error().into());
        }
        let find = Find(handle);
        let mut name = String::with_capacity(256);
        loop {
            let len = data.name.iter().take_while(|unit| **unit != 0).count();
            let units = &data.name[..len];
            let attributes = data.attributes;
            let hidden = attributes & FILE_ATTRIBUTE_HIDDEN != 0 || units.first() == Some(&0x2e);
            if units != [0x2e] && units != [0x2e, 0x2e] && (config.hidden || !hidden) {
                name.clear();
                name.extend(
                    char::decode_utf16(units.iter().copied()).map(|c| c.unwrap_or('\u{FFFD}')),
                );
                let directory = attributes & FILE_ATTRIBUTE_DIRECTORY != 0;
                let link = attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0;
                let mut flags = 0;
                if directory {
                    flags |= FLAG_DIR;
                }
                if link {
                    flags |= FLAG_LINK;
                }
                if hidden {
                    flags |= FLAG_HIDDEN;
                }
                if attributes & FILE_ATTRIBUTE_SYSTEM != 0 {
                    flags |= FLAG_SYSTEM;
                }
                emit(Child {
                    name: name.as_bytes(),
                    flags,
                    size: if directory {
                        UNKNOWN_SIZE
                    } else {
                        u64::from(data.size_high) << 32 | u64::from(data.size_low)
                    },
                    mtime: unix_millis(&data.write),
                    descend: directory && !link,
                });
            }
            // SAFETY: `find.0` is a live search handle and `data` a live out buffer.
            if unsafe { FindNextFileW(find.0, &raw mut data) } == 0 {
                break;
            }
        }
        Ok(())
    }
}

#[cfg(unix)]
mod imp {
    use std::{
        ffi::OsStr,
        os::unix::{ffi::OsStrExt, fs::MetadataExt},
    };

    use super::{Child, FLAG_DIR, FLAG_HIDDEN, FLAG_LINK, UNKNOWN_MTIME, UNKNOWN_SIZE, WalkConfig};
    use crate::Result;

    fn path(bytes: &[u8]) -> &std::path::Path {
        std::path::Path::new(OsStr::from_bytes(bytes))
    }

    fn millis(meta: &std::fs::Metadata) -> i64 {
        meta.mtime() * 1000 + meta.mtime_nsec() / 1_000_000
    }

    pub(super) fn device(bytes: &[u8]) -> u64 {
        std::fs::symlink_metadata(path(bytes)).map_or(0, |meta| meta.dev())
    }

    pub(super) fn dir_mtime(bytes: &[u8]) -> Option<i64> {
        let meta = std::fs::symlink_metadata(path(bytes)).ok()?;
        meta.is_dir().then(|| millis(&meta))
    }

    pub(super) fn list_dir(
        bytes: &[u8],
        config: &WalkConfig<'_>,
        device: u64,
        emit: &mut dyn FnMut(Child<'_>),
    ) -> Result<()> {
        if config.one_file_system && device != 0 && self::device(bytes) != device {
            return Ok(());
        }
        for entry in std::fs::read_dir(path(bytes))? {
            let Ok(entry) = entry else { continue };
            let name = entry.file_name();
            let name = name.as_bytes();
            let hidden = name.first() == Some(&b'.');
            if hidden && !config.hidden {
                continue;
            }
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let (mut size, mut mtime) = (UNKNOWN_SIZE, UNKNOWN_MTIME);
            if config.stat {
                if let Ok(meta) = entry.metadata() {
                    if !kind.is_dir() {
                        size = meta.size();
                    }
                    mtime = millis(&meta);
                }
            }
            let mut flags = 0;
            if kind.is_dir() {
                flags |= FLAG_DIR;
            }
            if kind.is_symlink() {
                flags |= FLAG_LINK;
            }
            if hidden {
                flags |= FLAG_HIDDEN;
            }
            emit(Child {
                name,
                flags,
                size,
                mtime,
                descend: kind.is_dir(),
            });
        }
        Ok(())
    }
}
