//! Landlock: unprivileged filesystem sandboxing (`landlock_*` syscalls, Linux 5.13+).
//!
//! Landlock domains are per-thread. `restrict_self` confines the calling
//! thread and every thread it creates afterwards.

use bun_jsc::{CallFrame, JSGlobalObject, JSValue, JsResult};

#[cfg(target_os = "linux")]
mod access {
    pub(super) const EXECUTE: u64 = 1 << 0;
    pub(super) const WRITE_FILE: u64 = 1 << 1;
    pub(super) const READ_FILE: u64 = 1 << 2;
    pub(super) const READ_DIR: u64 = 1 << 3;
    pub(super) const REFER: u64 = 1 << 13;
    pub(super) const TRUNCATE: u64 = 1 << 14;
    pub(super) const IOCTL_DEV: u64 = 1 << 15;

    /// Rights that make sense on a regular file (the kernel rejects the rest with `EINVAL`).
    pub(super) const FILE_RIGHTS: u64 = EXECUTE | WRITE_FILE | READ_FILE | TRUNCATE | IOCTL_DEV;
    pub(super) const READ: u64 = READ_FILE | READ_DIR;

    /// Every filesystem right the given ABI version knows.
    pub(super) fn handled(abi: i64) -> u64 {
        let mut mask = (1u64 << 13) - 1;
        if abi >= 2 {
            mask |= REFER;
        }
        if abi >= 3 {
            mask |= TRUNCATE;
        }
        if abi >= 5 {
            mask |= IOCTL_DEV;
        }
        mask
    }
}

#[cfg(target_os = "linux")]
const LANDLOCK_CREATE_RULESET_VERSION: libc::c_long = 1;
#[cfg(target_os = "linux")]
const LANDLOCK_RULE_PATH_BENEATH: libc::c_long = 1;
#[cfg(target_os = "linux")]
const PR_SET_NO_NEW_PRIVS: libc::c_long = 38;

/// `struct landlock_ruleset_attr` as of ABI 1; later fields are left to the kernel's defaults.
#[cfg(target_os = "linux")]
#[repr(C)]
struct RulesetAttr {
    handled_access_fs: u64,
}

#[cfg(target_os = "linux")]
#[repr(C, packed)]
struct PathBeneathAttr {
    allowed_access: u64,
    parent_fd: i32,
}

/// The ABI version, or the `errno` of the failed probe.
#[cfg(target_os = "linux")]
fn abi_version() -> Result<i64, i32> {
    // SAFETY: a null attribute with the VERSION flag only queries the ABI version.
    let rc = unsafe {
        libc::syscall(
            super::nr::LANDLOCK_CREATE_RULESET,
            core::ptr::null::<RulesetAttr>(),
            0 as libc::c_long,
            LANDLOCK_CREATE_RULESET_VERSION,
        )
    };
    if rc < 0 {
        Err(bun_sys::last_errno())
    } else {
        Ok(rc as i64)
    }
}

/// `landlockAbiVersion()` returns 0 when Landlock is unavailable.
#[bun_jsc::host_fn]
pub(crate) fn js_landlock_abi_version(
    global: &JSGlobalObject,
    frame: &CallFrame,
) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let _ = (global, frame);
        let version = abi_version().unwrap_or(0);
        Ok(JSValue::js_number_from_int64(version))
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}

#[cfg(target_os = "linux")]
fn path_list(global: &JSGlobalObject, list: JSValue) -> JsResult<Vec<std::ffi::CString>> {
    let mut out = Vec::new();
    if list.is_undefined_or_null() {
        return Ok(out);
    }
    let len = list.get_length(global)?;
    for i in 0..len {
        let item = list.get_index(global, i as u32)?.to_utf8(global)?;
        let bytes: &[u8] = &item;
        match std::ffi::CString::new(bytes) {
            Ok(c) => out.push(c),
            Err(_) => {
                return Err(global.throw_type_error(format_args!(
                    "paths must not contain null bytes"
                )));
            }
        }
    }
    Ok(out)
}

/// Closes the descriptor on drop.
#[cfg(target_os = "linux")]
struct Fd(libc::c_int);

#[cfg(target_os = "linux")]
impl Drop for Fd {
    fn drop(&mut self) {
        // SAFETY: the descriptor is owned and closed once.
        unsafe { libc::close(self.0) };
    }
}

#[cfg(target_os = "linux")]
fn add_rule(
    global: &JSGlobalObject,
    ruleset: &Fd,
    path: &std::ffi::CStr,
    rights: u64,
    handled: u64,
) -> JsResult<()> {
    // SAFETY: `path` is NUL-terminated.
    let raw = unsafe { libc::open(path.as_ptr(), libc::O_PATH | libc::O_CLOEXEC) };
    if raw < 0 {
        return Err(super::errno_error(
            global,
            bun_sys::last_errno(),
            "open",
            Some(path.to_bytes()),
        ));
    }
    let parent = Fd(raw);

    // SAFETY: all-zero is a valid `stat`.
    let mut st: libc::stat = unsafe { core::mem::zeroed() };
    // SAFETY: `parent` is open and `st` is a valid out-pointer.
    if unsafe { libc::fstat(parent.0, &mut st) } != 0 {
        return Err(super::errno_error(
            global,
            bun_sys::last_errno(),
            "fstat",
            Some(path.to_bytes()),
        ));
    }
    let is_dir = (st.st_mode & libc::S_IFMT) == libc::S_IFDIR;
    let mut allowed = rights & handled;
    if !is_dir {
        allowed &= access::FILE_RIGHTS;
    }

    let attr = PathBeneathAttr {
        allowed_access: allowed,
        parent_fd: parent.0,
    };
    // SAFETY: `attr` matches `struct landlock_path_beneath_attr` and outlives the call.
    let rc = unsafe {
        libc::syscall(
            super::nr::LANDLOCK_ADD_RULE,
            ruleset.0 as libc::c_long,
            LANDLOCK_RULE_PATH_BENEATH,
            core::ptr::addr_of!(attr),
            0 as libc::c_long,
        )
    };
    super::check(global, rc, "landlock_add_rule", Some(path.to_bytes()))?;
    Ok(())
}

/// `landlockRestrictSelf(readOnly, readWrite, execute)` handles every right the
/// kernel's ABI knows and allows only what the three path lists grant.
#[bun_jsc::host_fn]
pub(crate) fn js_landlock_restrict_self(
    global: &JSGlobalObject,
    frame: &CallFrame,
) -> JsResult<JSValue> {
    #[cfg(target_os = "linux")]
    {
        let read_only = path_list(global, frame.argument(0))?;
        let read_write = path_list(global, frame.argument(1))?;
        let execute = path_list(global, frame.argument(2))?;

        let abi = match abi_version() {
            Ok(v) if v >= 1 => v,
            Ok(_) => {
                return Err(super::errno_error(
                    global,
                    libc::ENOSYS,
                    "landlock_create_ruleset",
                    None,
                ));
            }
            Err(errno) => {
                return Err(super::errno_error(
                    global,
                    errno,
                    "landlock_create_ruleset",
                    None,
                ));
            }
        };
        let handled = access::handled(abi);

        let attr = RulesetAttr {
            handled_access_fs: handled,
        };
        // SAFETY: `attr` matches the ABI 1 `struct landlock_ruleset_attr` and outlives the call.
        let rc = unsafe {
            libc::syscall(
                super::nr::LANDLOCK_CREATE_RULESET,
                core::ptr::addr_of!(attr),
                core::mem::size_of::<RulesetAttr>() as libc::c_long,
                0 as libc::c_long,
            )
        };
        let ruleset = Fd(super::check(global, rc, "landlock_create_ruleset", None)? as libc::c_int);

        let read_write_rights = handled & !access::EXECUTE;
        for path in &read_only {
            add_rule(global, &ruleset, path, access::READ, handled)?;
        }
        for path in &read_write {
            add_rule(global, &ruleset, path, read_write_rights, handled)?;
        }
        for path in &execute {
            add_rule(
                global,
                &ruleset,
                path,
                access::EXECUTE | access::READ,
                handled,
            )?;
        }

        // SAFETY: `PR_SET_NO_NEW_PRIVS` takes plain integers.
        let rc = unsafe {
            libc::syscall(
                super::nr::PRCTL,
                PR_SET_NO_NEW_PRIVS,
                1 as libc::c_long,
                0 as libc::c_long,
                0 as libc::c_long,
                0 as libc::c_long,
            )
        };
        super::check(global, rc, "prctl", None)?;

        // SAFETY: `ruleset` is a valid ruleset descriptor.
        let rc = unsafe {
            libc::syscall(
                super::nr::LANDLOCK_RESTRICT_SELF,
                ruleset.0 as libc::c_long,
                0 as libc::c_long,
            )
        };
        super::check(global, rc, "landlock_restrict_self", None)?;
        Ok(JSValue::UNDEFINED)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = frame;
        Err(super::unsupported(global))
    }
}
