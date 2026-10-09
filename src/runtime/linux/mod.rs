//! `bun:linux` — thin, synchronous bindings to Linux kernel interfaces.
//!
//! The JS module is `src/js/bun/linux.ts`. It validates its arguments and
//! calls the `js_*` host functions in the sibling files through
//! `$newRustFunction`; nothing here runs until the module is imported.
//!
//! Every host function exists on every platform so the generated thunks link.
//! Outside Linux they throw `ERR_BUN_LINUX_UNSUPPORTED`.
//!
//! Syscalls go through `libc::syscall` with the numbers in [`nr`]: musl lacks
//! wrappers for most of them, and the numbers are stable kernel ABI.

pub(crate) mod bpf;
pub(crate) mod caps;
pub(crate) mod cgroup;
pub(crate) mod io_uring;
pub(crate) mod kmod;
pub(crate) mod landlock;
pub(crate) mod memfd;
pub(crate) mod mount;
pub(crate) mod namespaces;
pub(crate) mod netlink;
pub(crate) mod perf_event;
pub(crate) mod pidfd;
pub(crate) mod power;
pub(crate) mod reap;
pub(crate) mod seccomp;
pub(crate) mod sysctl;

#[cfg(not(target_os = "linux"))]
use bun_jsc::JsError;
#[cfg(target_os = "linux")]
use bun_jsc::{CallFrame, JsError, JsResult};
use bun_jsc::JSGlobalObject;

/// Error thrown by every host function outside Linux.
#[cfg(not(target_os = "linux"))]
pub(crate) fn unsupported(global: &JSGlobalObject) -> JsError {
    let err = global.create_error_instance(format_args!("bun:linux is only available on Linux"));
    if let Ok(code) =
        bun_jsc::bun_string_jsc::create_utf8_for_js(global, b"ERR_BUN_LINUX_UNSUPPORTED")
    {
        err.put(global, "code", code);
    }
    global.throw_value(err)
}

/// Syscall numbers. `x86_64` and `aarch64` differ for the older calls; the
/// ones added since Linux 5.1 share one number on every architecture.
#[cfg(target_os = "linux")]
pub(crate) mod nr {
    use libc::c_long;

    #[cfg(target_arch = "x86_64")]
    mod arch {
        use libc::c_long;
        pub(super) const MOUNT: c_long = 165;
        pub(super) const UMOUNT2: c_long = 166;
        pub(super) const PIVOT_ROOT: c_long = 155;
        pub(super) const CAPGET: c_long = 125;
        pub(super) const CAPSET: c_long = 126;
        pub(super) const PRCTL: c_long = 157;
        pub(super) const REBOOT: c_long = 169;
        pub(super) const INIT_MODULE: c_long = 175;
        pub(super) const DELETE_MODULE: c_long = 176;
        pub(super) const UNSHARE: c_long = 272;
        pub(super) const SETNS: c_long = 308;
        pub(super) const FINIT_MODULE: c_long = 313;
        pub(super) const MEMFD_CREATE: c_long = 319;
        pub(super) const KEXEC_FILE_LOAD: c_long = 320;
        pub(super) const PERF_EVENT_OPEN: c_long = 298;
        pub(super) const SECCOMP: c_long = 317;
        pub(super) const BPF: c_long = 321;
    }

    #[cfg(target_arch = "aarch64")]
    mod arch {
        use libc::c_long;
        pub(super) const MOUNT: c_long = 40;
        pub(super) const UMOUNT2: c_long = 39;
        pub(super) const PIVOT_ROOT: c_long = 41;
        pub(super) const CAPGET: c_long = 90;
        pub(super) const CAPSET: c_long = 91;
        pub(super) const PRCTL: c_long = 167;
        pub(super) const REBOOT: c_long = 142;
        pub(super) const INIT_MODULE: c_long = 105;
        pub(super) const DELETE_MODULE: c_long = 106;
        pub(super) const UNSHARE: c_long = 97;
        pub(super) const SETNS: c_long = 268;
        pub(super) const FINIT_MODULE: c_long = 273;
        pub(super) const MEMFD_CREATE: c_long = 279;
        pub(super) const KEXEC_FILE_LOAD: c_long = 294;
        pub(super) const PERF_EVENT_OPEN: c_long = 241;
        pub(super) const SECCOMP: c_long = 277;
        pub(super) const BPF: c_long = 280;
    }

    /// `-1` makes the kernel answer `ENOSYS`.
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    mod arch {
        use libc::c_long;
        pub(super) const MOUNT: c_long = -1;
        pub(super) const UMOUNT2: c_long = -1;
        pub(super) const PIVOT_ROOT: c_long = -1;
        pub(super) const CAPGET: c_long = -1;
        pub(super) const CAPSET: c_long = -1;
        pub(super) const PRCTL: c_long = -1;
        pub(super) const REBOOT: c_long = -1;
        pub(super) const INIT_MODULE: c_long = -1;
        pub(super) const DELETE_MODULE: c_long = -1;
        pub(super) const UNSHARE: c_long = -1;
        pub(super) const SETNS: c_long = -1;
        pub(super) const FINIT_MODULE: c_long = -1;
        pub(super) const MEMFD_CREATE: c_long = -1;
        pub(super) const KEXEC_FILE_LOAD: c_long = -1;
        pub(super) const PERF_EVENT_OPEN: c_long = -1;
        pub(super) const SECCOMP: c_long = -1;
        pub(super) const BPF: c_long = -1;
    }

    pub(crate) const MOUNT: c_long = arch::MOUNT;
    pub(crate) const UMOUNT2: c_long = arch::UMOUNT2;
    pub(crate) const PIVOT_ROOT: c_long = arch::PIVOT_ROOT;
    pub(crate) const CAPGET: c_long = arch::CAPGET;
    pub(crate) const CAPSET: c_long = arch::CAPSET;
    pub(crate) const PRCTL: c_long = arch::PRCTL;
    pub(crate) const REBOOT: c_long = arch::REBOOT;
    pub(crate) const INIT_MODULE: c_long = arch::INIT_MODULE;
    pub(crate) const DELETE_MODULE: c_long = arch::DELETE_MODULE;
    pub(crate) const UNSHARE: c_long = arch::UNSHARE;
    pub(crate) const SETNS: c_long = arch::SETNS;
    pub(crate) const FINIT_MODULE: c_long = arch::FINIT_MODULE;
    pub(crate) const MEMFD_CREATE: c_long = arch::MEMFD_CREATE;
    pub(crate) const KEXEC_FILE_LOAD: c_long = arch::KEXEC_FILE_LOAD;
    pub(crate) const PERF_EVENT_OPEN: c_long = arch::PERF_EVENT_OPEN;
    pub(crate) const SECCOMP: c_long = arch::SECCOMP;
    pub(crate) const BPF: c_long = arch::BPF;

    pub(crate) const PIDFD_SEND_SIGNAL: c_long = 424;
    pub(crate) const IO_URING_SETUP: c_long = 425;
    pub(crate) const IO_URING_REGISTER: c_long = 427;
    pub(crate) const PIDFD_OPEN: c_long = 434;
    pub(crate) const PIDFD_GETFD: c_long = 438;
    pub(crate) const LANDLOCK_CREATE_RULESET: c_long = 444;
    pub(crate) const LANDLOCK_ADD_RULE: c_long = 445;
    pub(crate) const LANDLOCK_RESTRICT_SELF: c_long = 446;
}

/// Turn a failed syscall's `errno` into a thrown JS error shaped like the
/// `node:fs` ones: `code`, `errno` (negative), `syscall` and optionally `path`.
#[cfg(target_os = "linux")]
pub(crate) fn errno_error(
    global: &JSGlobalObject,
    errno: i32,
    syscall: &'static str,
    path: Option<&[u8]>,
) -> JsError {
    let base = bun_sys::Error::from_code_int(errno, bun_sys::Tag::TODO);
    let mut err = base.to_system_error();

    let mut message = match base.uv_code_label() {
        Some((code, label)) => format!("{code}: {label}, {syscall}"),
        None => format!("errno {errno}, {syscall}"),
    };
    if let Some(path) = path {
        message.push_str(" '");
        message.push_str(&String::from_utf8_lossy(path));
        message.push('\'');
        err.path = bun_core::String::clone_utf8(path);
    }
    err.syscall = bun_core::String::static_(syscall.as_bytes());
    err.message = bun_core::String::clone_utf8(message.as_bytes());

    global.throw_value(bun_jsc::SystemError::from(err).to_error_instance(global))
}

/// `Ok(rc)` for a non-negative return, otherwise throws with the current `errno`.
#[cfg(target_os = "linux")]
pub(crate) fn check(
    global: &JSGlobalObject,
    rc: libc::c_long,
    syscall: &'static str,
    path: Option<&[u8]>,
) -> JsResult<libc::c_long> {
    if rc < 0 {
        Err(errno_error(global, bun_sys::last_errno(), syscall, path))
    } else {
        Ok(rc)
    }
}

/// Argument `i` as an integer. The JS layer has already validated it.
#[cfg(target_os = "linux")]
pub(crate) fn int_arg(frame: &CallFrame, i: usize) -> i64 {
    frame.argument(i).to_int64()
}

/// Argument `i` as a `u64` carried in two `u32` numbers at `i` (low) and `i + 1` (high).
#[cfg(target_os = "linux")]
pub(crate) fn u64_arg(frame: &CallFrame, i: usize) -> u64 {
    let lo = frame.argument(i).to_int64() as u64 & 0xffff_ffff;
    let hi = frame.argument(i + 1).to_int64() as u64 & 0xffff_ffff;
    (hi << 32) | lo
}

/// Argument `i` as a NUL-terminated string; `undefined` and `null` give `None`.
#[cfg(target_os = "linux")]
pub(crate) fn opt_cstr_arg(
    global: &JSGlobalObject,
    frame: &CallFrame,
    i: usize,
) -> JsResult<Option<std::ffi::CString>> {
    let value = frame.argument(i);
    if value.is_undefined_or_null() {
        return Ok(None);
    }
    let utf8 = value.to_utf8(global)?;
    let bytes: &[u8] = &utf8;
    match std::ffi::CString::new(bytes) {
        Ok(c) => Ok(Some(c)),
        Err(_) => Err(global.throw_type_error(format_args!(
            "argument {} must not contain null bytes",
            i + 1
        ))),
    }
}

/// Like [`opt_cstr_arg`] for a required string.
#[cfg(target_os = "linux")]
pub(crate) fn cstr_arg(
    global: &JSGlobalObject,
    frame: &CallFrame,
    i: usize,
) -> JsResult<std::ffi::CString> {
    match opt_cstr_arg(global, frame, i)? {
        Some(c) => Ok(c),
        None => Err(global.throw_invalid_arguments(format_args!(
            "argument {} must be a string",
            i + 1
        ))),
    }
}

/// Read a whole (small) file. `Err` carries `errno`.
#[cfg(target_os = "linux")]
pub(crate) fn read_file(path: &std::ffi::CStr, cap: usize) -> Result<Vec<u8>, i32> {
    // SAFETY: `path` is NUL-terminated.
    let fd = unsafe { libc::open(path.as_ptr(), libc::O_RDONLY | libc::O_CLOEXEC) };
    if fd < 0 {
        return Err(bun_sys::last_errno());
    }
    let mut out = Vec::new();
    let mut buf = [0u8; 4096];
    let result = loop {
        // SAFETY: `buf` is valid for `buf.len()` bytes; `fd` is open.
        let n = unsafe { libc::read(fd, buf.as_mut_ptr().cast(), buf.len()) };
        if n < 0 {
            let errno = bun_sys::last_errno();
            if errno == libc::EINTR {
                continue;
            }
            break Err(errno);
        }
        if n == 0 {
            break Ok(());
        }
        out.extend_from_slice(&buf[..n as usize]);
        if out.len() >= cap {
            out.truncate(cap);
            break Ok(());
        }
    };
    // SAFETY: `fd` was opened above and is closed once.
    unsafe { libc::close(fd) };
    result.map(|()| out)
}

/// Write `data` to an existing file with one `write(2)`, as procfs/sysfs/cgroupfs expect.
/// `Err` carries `errno`.
#[cfg(target_os = "linux")]
pub(crate) fn write_file(path: &std::ffi::CStr, data: &[u8]) -> Result<(), i32> {
    // SAFETY: `path` is NUL-terminated.
    let fd = unsafe { libc::open(path.as_ptr(), libc::O_WRONLY | libc::O_CLOEXEC) };
    if fd < 0 {
        return Err(bun_sys::last_errno());
    }
    let result = loop {
        // SAFETY: `data` is valid for `data.len()` bytes; `fd` is open.
        let n = unsafe { libc::write(fd, data.as_ptr().cast(), data.len()) };
        if n < 0 {
            let errno = bun_sys::last_errno();
            if errno == libc::EINTR {
                continue;
            }
            break Err(errno);
        }
        break Ok(());
    };
    // SAFETY: `fd` was opened above and is closed once.
    unsafe { libc::close(fd) };
    result
}

/// Drop trailing ASCII whitespace.
#[cfg(target_os = "linux")]
pub(crate) fn trim_end(mut bytes: &[u8]) -> &[u8] {
    while let [rest @ .., last] = bytes {
        if last.is_ascii_whitespace() {
            bytes = rest;
        } else {
            break;
        }
    }
    bytes
}
