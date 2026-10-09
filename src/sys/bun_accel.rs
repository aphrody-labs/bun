//! `/dev/bun_accel`, the batched file copy device of the Aphrody kernel
//! (`CONFIG_BUN_ACCEL`, `include/uapi/linux/bun_accel.h` in aphrody-labs/linux).
//!
//! One `BUN_ACCEL_IOC_COPY_BATCH` call opens, creates (`O_EXCL`) and copies up
//! to [`MAX_BATCH`] files, replacing the open/create/fstat/fchmod/copy/close
//! sequence issued per file. Absent the device, [`device`] returns `None`.

use std::sync::OnceLock;

use crate::{Error, Fd, Maybe, Tag};

/// `BUN_ACCEL_SOURCE_MODE`: create the destination with the source's permission bits.
pub const SOURCE_MODE: u32 = 1 << 1;
/// `BUN_ACCEL_MAX_BATCH`
pub const MAX_BATCH: usize = 1024;

/// `struct bun_accel_copy`
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CopyEntry {
    pub src_dirfd: i32,
    pub dst_dirfd: i32,
    pub src_path: u64,
    pub dst_path: u64,
    pub mode: u32,
    pub flags: u32,
    /// Bytes copied, or a negative errno.
    pub result: i64,
}

/// `struct bun_accel_batch`
#[repr(C)]
struct Batch {
    entries: u64,
    count: u32,
    flags: u32,
    done: u32,
    reserved: u32,
}

const _: () = assert!(core::mem::size_of::<CopyEntry>() == 40);
const _: () = assert!(core::mem::size_of::<Batch>() == 24);

/// `_IOWR(0xB9, 0x01, struct bun_accel_batch)` with the asm-generic encoding (x86_64, aarch64).
const IOC_COPY_BATCH: libc::c_ulong = (3 << 30) | (24 << 16) | (0xB9 << 8) | 0x01;

/// The device, opened once per process; `None` when the kernel lacks it.
pub fn device() -> Option<Fd> {
    static DEVICE: OnceLock<libc::c_int> = OnceLock::new();
    let fd = *DEVICE.get_or_init(|| {
        // SAFETY: the path is a NUL-terminated literal.
        unsafe { libc::open(c"/dev/bun_accel".as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC) }
    });
    (fd >= 0).then(|| Fd::from_native(fd))
}

/// Runs every entry, resuming after signal interruptions. Per-entry failures
/// are reported in [`CopyEntry::result`]; `Err` means the device refused the
/// batch itself and none of the remaining entries ran.
pub fn copy_batch(device: Fd, entries: &mut [CopyEntry]) -> Maybe<()> {
    let mut start = 0;
    while start < entries.len() {
        let end = (start + MAX_BATCH).min(entries.len());
        let chunk = &mut entries[start..end];
        let mut batch = Batch {
            entries: chunk.as_mut_ptr() as u64,
            count: chunk.len() as u32,
            flags: 0,
            done: 0,
            reserved: 0,
        };
        // SAFETY: `batch` points at `chunk.len()` entries whose path pointers the
        // caller keeps alive; the kernel writes only `result` and `done`.
        let rc = unsafe {
            libc::ioctl(
                device.native(),
                IOC_COPY_BATCH as _,
                core::ptr::addr_of_mut!(batch),
            )
        };
        if rc < 0 {
            let errno = crate::last_errno();
            if errno == libc::EINTR {
                continue;
            }
            return Err(Error::from_code_int(errno, Tag::copyfile));
        }
        start += batch.done as usize;
    }
    Ok(())
}
