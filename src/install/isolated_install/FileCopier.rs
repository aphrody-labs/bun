#[cfg(windows)]
use core::ptr;

use bun_alloc::AllocError;
use bun_paths::path_options::{CheckLength, Kind, PathSeparators};
use bun_paths::{self, OSPathChar, OSPathSlice};
use bun_sys::{self as sys, Dir, E, EntryKind, Fd, walker_skippable, walker_skippable::Walker};

// The path-builder types here use the OS path unit: u8 on POSIX,
// u16 on Windows — encoded via `OSPathChar` so `slice()`/`slice_z()` produce
// the platform-native width. The auto separator mode normalizes `/` → `\` on Windows
// during `from`/`append`, which is load-bearing for the Win32 calls below.
// Length-checked like the Hardlinker's paths: the walker entries appended on Windows are unbounded.
type AbsPathAutoOs =
    bun_paths::AbsPath<OSPathChar, { PathSeparators::AUTO }, { CheckLength::CHECK }>;
type PathAutoOs =
    bun_paths::Path<OSPathChar, { Kind::ANY }, { PathSeparators::AUTO }, { CheckLength::CHECK }>;

pub(crate) struct FileCopier {
    #[cfg(target_os = "linux")]
    src_dir: Fd,
    pub(crate) src_path: AbsPathAutoOs,
    pub(crate) dest_subpath: PathAutoOs,
    pub(crate) walker: Walker,
}

impl FileCopier {
    pub(crate) fn init(
        src_dir: Fd,
        src_path: bun_paths::AbsPath<OSPathChar, { PathSeparators::AUTO }>,
        dest_subpath: bun_paths::Path<OSPathChar, { Kind::ANY }, { PathSeparators::AUTO }>,
        skip_dirnames: &[&OSPathSlice],
    ) -> Result<FileCopier, AllocError> {
        Ok(FileCopier {
            #[cfg(target_os = "linux")]
            src_dir,
            src_path: src_path.into_checked(),
            dest_subpath: dest_subpath.into_checked(),
            walker: {
                let mut w = walker_skippable::walk(
                    src_dir,
                    // bun.default_allocator → deleted (global mimalloc)
                    &[],
                    skip_dirnames,
                )?;
                w.resolve_unknown_entry_types = true;
                w
            },
        })
    }

    // `Walker` owns its resources and drops automatically, so no explicit
    // `Drop` impl is needed.

    pub(crate) fn copy(&mut self) -> sys::Result<()> {
        // `make_open_path` is u8-only; on Windows the OS-unit path is u16 so
        // narrow it via the same infallible `from_w_path` transcode that
        // `bun_sys::make_path_w` uses. Don't synthesise EINVAL on
        // conversion — store paths are built from UTF-8 package names and are
        // always WTF-8 round-trippable. On POSIX `OSPathChar == u8` and
        // `slice_z()` already yields `&ZStr`, so deref-coerce to `&[u8]`.
        #[cfg(windows)]
        let mut dest_u8_buf = bun_paths::path_buffer_pool::get();
        #[cfg(windows)]
        let dest_subpath_u8: &[u8] =
            bun_paths::string_paths::from_w_path(&mut dest_u8_buf[..], self.dest_subpath.slice())
                .as_bytes();
        #[cfg(not(windows))]
        let dest_subpath_u8: &[u8] = self.dest_subpath.slice_z().as_bytes();
        let dest_dir = match bun_sys::make_path::make_open_path(
            &Dir::cwd(),
            dest_subpath_u8,
            Default::default(),
        ) {
            Ok(d) => d,
            Err(e) => {
                // TODO: remove the need for this and implement openDir makePath makeOpenPath in bun
                let errno: E = match e.get_errno() {
                    E::EACCES => E::EPERM,
                    other => other,
                };
                #[cfg(windows)]
                let errno = if errno == E::ENOTDIR {
                    E::ENOENT
                } else {
                    errno
                };

                return sys::Result::Err(sys::Error::from_code(errno, sys::Tag::copyfile));
            }
        };

        #[cfg(not(windows))]
        let mut copy_file_state = bun_sys::copy_file::CopyFileState::default();

        // NUL-terminated paths relative to both `self.src_dir` and `dest_dir`,
        // copied in batches by the Aphrody kernel's /dev/bun_accel when present.
        #[cfg(target_os = "linux")]
        let accel = bun_sys::bun_accel::device();
        #[cfg(target_os = "linux")]
        let mut pending: Vec<u8> = Vec::new();
        #[cfg(target_os = "linux")]
        let mut pending_count = 0usize;

        while let Some(entry) = self.walker.next()? {
            #[cfg(windows)]
            {
                match entry.kind {
                    EntryKind::Directory | EntryKind::File => {}
                    _ => continue,
                }

                // A `path.save()` ResetScope would hold `&mut Path` and keep
                // `self.src_path` / `self.dest_subpath` exclusively borrowed
                // for the rest of the iteration. Capture the saved lengths and
                // restore via `set_length` after the body instead.
                let src_saved_len = self.src_path.len();
                let dest_saved_len = self.dest_subpath.len();
                let appended = self.src_path.append(entry.path.as_slice()).is_ok()
                    && self.dest_subpath.append(entry.path.as_slice()).is_ok();

                let result: sys::Result<()> = match entry.kind {
                    _ if !appended => {
                        sys::Result::Err(sys::Error::from_code(E::ENAMETOOLONG, sys::Tag::copyfile))
                    }
                    EntryKind::Directory => {
                        // SAFETY: FFI — both `slice_z()` are NUL-terminated WStrs.
                        if unsafe {
                            bun_sys::windows::CreateDirectoryExW(
                                self.src_path.slice_z().as_ptr(),
                                self.dest_subpath.slice_z().as_ptr(),
                                ptr::null_mut(),
                            )
                        } == 0
                        {
                            // Also taken when the directory exists, a success for make_path.
                            bun_sys::make_path::make_path::<u16>(&dest_dir, entry.path.as_slice())
                        } else {
                            sys::Result::Ok(())
                        }
                    }
                    EntryKind::File => {
                        match bun_sys::copy_file::copy_file(
                            self.src_path.slice_z(),
                            self.dest_subpath.slice_z(),
                        ) {
                            sys::Result::Ok(()) => sys::Result::Ok(()),
                            sys::Result::Err(first_err) => {
                                // Retry after creating the parent directory.
                                // For root-level files (`index.js`,
                                // `package.json`, `LICENSE`) `dirname` is
                                // null and there is no missing parent to
                                // create — `dest_dir` itself was already
                                // opened above — so the original error is the
                                // real failure and must propagate. Silently
                                // continuing here would let a staged
                                // global-store entry be renamed into place
                                // with files missing.
                                match bun_paths::Dirname::dirname::<u16>(entry.path.as_slice()) {
                                    None => sys::Result::Err(first_err),
                                    Some(entry_dirname) => {
                                        let _ = bun_sys::make_path::make_path::<u16>(
                                            &dest_dir,
                                            entry_dirname,
                                        );
                                        bun_sys::copy_file::copy_file(
                                            self.src_path.slice_z(),
                                            self.dest_subpath.slice_z(),
                                        )
                                    }
                                }
                            }
                        }
                    }
                    _ => unreachable!(),
                };

                self.src_path.set_length(src_saved_len);
                self.dest_subpath.set_length(dest_saved_len);

                result?;
            }
            #[cfg(target_os = "linux")]
            if let Some(device) = accel {
                match entry.kind {
                    // Walkers yield a directory before its contents, so parents exist
                    // by the time a batch runs; a failure falls back per file below.
                    EntryKind::Directory => {
                        let _ = bun_sys::mkdirat(dest_dir.fd(), entry.path, 0o755);
                    }
                    EntryKind::File => {
                        pending.extend_from_slice(entry.path.as_bytes_with_nul());
                        pending_count += 1;
                        if pending_count == bun_sys::bun_accel::MAX_BATCH {
                            flush_accel(
                                device,
                                self.src_dir,
                                &dest_dir,
                                &pending,
                                &mut copy_file_state,
                            )?;
                            pending.clear();
                            pending_count = 0;
                        }
                    }
                    _ => {}
                }
                continue;
            }

            #[cfg(not(windows))]
            {
                if entry.kind != EntryKind::File {
                    continue;
                }
                copy_one(
                    entry.dir,
                    entry.basename,
                    &dest_dir,
                    entry.path,
                    &mut copy_file_state,
                )?;
            }
        }

        #[cfg(target_os = "linux")]
        if let Some(device) = accel {
            flush_accel(
                device,
                self.src_dir,
                &dest_dir,
                &pending,
                &mut copy_file_state,
            )?;
        }

        sys::Result::Ok(())
    }
}

/// Copies `src_dir/src_name` to `dest_dir/dest_path`, creating missing parents.
#[cfg(not(windows))]
fn copy_one(
    src_dir: Fd,
    src_name: &bun_paths::OSPathSliceZ,
    dest_dir: &Dir,
    dest_path: &bun_paths::OSPathSliceZ,
    copy_file_state: &mut bun_sys::copy_file::CopyFileState,
) -> sys::Result<()> {
    let src = bun_sys::File::from_fd(bun_sys::openat(src_dir, src_name, bun_sys::O::RDONLY, 0)?);

    let dest = match dest_dir.create_file_z(dest_path, Default::default()) {
        Ok(f) => f,
        Err(_) => {
            if let Some(entry_dirname) = bun_paths::Dirname::dirname::<OSPathChar>(dest_path) {
                let _ = bun_sys::make_path::make_path::<OSPathChar>(dest_dir, entry_dirname);
            }
            dest_dir.create_file_z(dest_path, Default::default())?
        }
    };

    #[cfg(unix)]
    {
        let stat = bun_sys::fstat(src.handle())?;
        // SAFETY: fchmod is safe to call with any fd + mode; errors are ignored (`_ =`).
        unsafe {
            let _ = bun_sys::c::fchmod(dest.handle().native(), stat.st_mode);
        }
    }

    bun_sys::copy_file::copy_file_with_state(src.handle(), dest.handle(), copy_file_state)
}

/// Copies `paths` (NUL-terminated, each relative to both directories) in
/// /dev/bun_accel batches. Entries the device could not copy, such as an
/// existing destination or a missing parent, go through [`copy_one`] so
/// errors and overwrite behavior match the per-file path.
#[cfg(target_os = "linux")]
fn flush_accel(
    device: Fd,
    src_dir: Fd,
    dest_dir: &Dir,
    paths: &[u8],
    copy_file_state: &mut bun_sys::copy_file::CopyFileState,
) -> sys::Result<()> {
    use bun_sys::bun_accel::{CopyEntry, SOURCE_MODE, copy_batch};

    let mut spans: Vec<(usize, usize)> = Vec::new();
    let mut entries: Vec<CopyEntry> = Vec::new();
    let mut start = 0;
    while start < paths.len() {
        let len = bun_core::strings::index_of_char_usize(&paths[start..], 0)
            .unwrap_or(paths.len() - start);
        let ptr = paths[start..].as_ptr() as u64;
        spans.push((start, len));
        entries.push(CopyEntry {
            src_dirfd: src_dir.native(),
            dst_dirfd: dest_dir.fd().native(),
            src_path: ptr,
            dst_path: ptr,
            mode: 0,
            flags: SOURCE_MODE,
            result: 0,
        });
        start += len + 1;
    }

    // `paths` outlives the call, so every pointer in `entries` stays valid.
    let batch_ok = copy_batch(device, &mut entries).is_ok();
    for (entry, &(start, len)) in entries.iter().zip(&spans) {
        if batch_ok && entry.result >= 0 {
            continue;
        }
        let path = bun_core::ZStr::from_buf(&paths[start..], len);
        copy_one(src_dir, path, dest_dir, path, copy_file_state)?;
    }
    sys::Result::Ok(())
}
